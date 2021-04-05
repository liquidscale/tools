import { createDraft, finishDraft, enablePatches, applyPatches, enableMapSet } from "immer";
import { queryBuilder } from "./query-builder.js";
import lodash from "lodash";
import { BehaviorSubject } from "rxjs";
import Query from "./mongo-query.js";
import shortid from "shortid-36";
import jp from "jsonpath";

const { last, get, findIndex } = lodash;

enablePatches();
enableMapSet();

export default function (key, config) {
  console.log("initializing memory store %s".gray, key, config);
  const snapshotTreshold = get(config, "snapshotTreshold") || 50;

  const _state = {
    frames: [],
    snapshots: [],
    publications: [],
    subscriptions: [],
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
      console.log("producing a snapshot for store %s at height %d".cyan, key, height);
      _state.snapshots.push({ height, data, ts: new Date().getTime() });
    }
  }

  const publisher = new BehaviorSubject();

  const stateFactory = function ({ initialState, height, locale = "en", ...context } = {}, constraints = []) {
    const state = {
      id: shortid.generate(),
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
            };
            _state.frames.push(newFrame);
          });

          publisher.next(state.data);

          // check if we need to create a snapshot
          triggerSnapshot(state.height, state.data);
        } catch (err) {
          console.error("commit error", state.id, err);
        }
      },
      rollback() {
        // noop
      },
      selector(expr) {
        const qb = queryBuilder(state.data, publisher);
        if (expr) {
          return qb.selector(expr);
        }
        return qb;
      },
    };

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
      state.data = frames.reduce((state, frame) => applyPatches(state, frame.patches), data);
      state.height = last(frames).height;
    } else {
      state.data = data;
      state.height = snapshot.length > 0 ? snapshot[0].height : height || 0;
    }

    if (!publisher.getValue()) {
      publisher.next(state.data);
    }

    return state;
  };

  return {
    key,
    type: "memory",
    stereotype: "store",
    async initState(initialState) {
      console.log("initializing store %s state", key, initialState);

      // create an initial snapshot
      if (initialState) {
        await triggerSnapshot(0, initialState, { force: true });
      }
      return stateFactory({ height: 0 });
    },
    async loadState(context, constraints = []) {
      return stateFactory(context, constraints);
    },
    async injectSnapshot(snapshot) {
      if (!snapshot.ts) {
        snapshot.ts = new Date().getTime();
      }
      console.log("injecting snapshot", snapshot);
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
