import { createDraft, finishDraft, enablePatches, applyPatches, enableMapSet, setAutoFreeze } from "immer";
import lodash from "lodash";
import { BehaviorSubject } from "rxjs";
import Query from "../mongo-query.js";

const { last, get, findIndex } = lodash;

enablePatches();
enableMapSet();
setAutoFreeze(false);

export default function (key, config, runtime) {
  const log = runtime.logger.child({ internal: true, module: "memory-store", key });

  log.trace("initializing memory store %s".gray, key, config);
  const snapshotTreshold = get(config, "snapshotTreshold") || 50;

  const _state = {
    frames: [],
    snapshots: [],
    publications: [],
    subscriptions: [],
  };

  const publisher = new BehaviorSubject();
  publisher.refresh = function () {
    const state = this.getValue();
    if (state) {
      state.rebuild({ forcePublish: true });
    }
  };

  async function heightSinceLastSnapshot() {
    const snapshot = new Query(_state.snapshots).findOne({}, { sort: { height: -1 } }).get();
    let query = {};
    if (snapshot) {
      query = { height: { $gt: snapshot.height } };
    }
    return new Query(_state.frames).find(query).get().length;
  }

  async function triggerSnapshot(height, data, { force = false } = {}) {
    const needSnapshot = force || (await heightSinceLastSnapshot()) >= snapshotTreshold;
    if (needSnapshot) {
      log.debug("producing a snapshot for store %s at height %d".cyan, key, height);
      _state.snapshots.push({ height, data, ts: new Date().getTime() });
    }
  }

  const stateFactory = function ({ initialState, height, locale = "en", ...context } = {}) {
    const state = {
      id: runtime.idGen(),
      locale,
      draft() {
        return createDraft(state.data);
      },
      commit(draft) {
        state.height++;
        try {
          state.data = finishDraft(draft, patches => {
            const newFrame = {
              height: state.height,
              ts: new Date().getTime(),
              locale,
              patches,
              actor: context.actor,
            };
            _state.frames.push(newFrame);
          });

          publisher.next(state);

          // check if we need to create a snapshot
          triggerSnapshot(state.height, state.data);
        } catch (err) {
          log.error("commit error", state.id, err);
        }
      },
      rollback() {
        // noop
      },
      selector(expr) {
        const qb = runtime.buildQuery(state.data, publisher);
        if (expr) {
          return qb.selector(expr);
        }
        return qb;
      },
      rebuild({ forcePublish = false } = {}) {
        const snapshot = new Query(_state.snapshots)
          .findOne({ height: { $lte: height || 0 } })
          .sort({ height: -1 })
          .get();

        const frameQuery = {};
        if (snapshot.length > 0) {
          frameQuery.height = { $gt: snapshot[0].height };
        } else {
          frameQuery.height = { $gte: height || 0 };
        }

        if (locale) {
          frameQuery.locale = locale;
        }

        const data = snapshot.length > 0 ? snapshot[0].data : initialState || {};

        // retrieve all frames after our computed height
        const frames = new Query(_state.frames).find(frameQuery).sort({ height: 1 }).get();
        if (frames.length > 0) {
          this.data = frames.reduce((state, frame) => applyPatches(state, frame.patches), data);
          this.height = last(frames).height;
        } else {
          this.data = data;
          this.height = snapshot.length > 0 ? snapshot[0].height : height || 0;
        }

        if (!publisher.getValue() || forcePublish) {
          publisher.next(state);
        }
      },
    };

    state.rebuild();

    return state;
  };

  return {
    key,
    type: "memory",
    stereotype: "store",
    async initState(initialState) {
      log.trace("initializing store %s state", key, initialState);

      // create an initial snapshot
      if (initialState) {
        await triggerSnapshot(0, initialState, { force: true });
      }
      return stateFactory({ height: 0 });
    },
    async loadState(context) {
      return stateFactory(context);
    },
    async injectSnapshot(snapshot) {
      if (!snapshot.ts) {
        snapshot.ts = new Date().getTime();
      }
      log.trace("injecting snapshot", snapshot);
      const targetIdx = findIndex(_state.snapshots, s => s.height === snapshot.height);
      if (targetIdx !== -1) {
        _state.snapshots[targetIdx] = snapshot;
      } else {
        _state.snapshots.push(snapshot);
      }
    },
    applyConfig(cfg) {},
  };
}
