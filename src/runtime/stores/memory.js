import { createDraft, finishDraft, enablePatches, applyPatches, enableMapSet } from "immer";
import { queryBuilder } from "./query-builder.js";
import lodash from "lodash";
import Observable from "rxjs";
import Query from "./mongo-query.js";

const { last, get, findIndex } = lodash;

enablePatches();
enableMapSet();

export default function (key, config) {
  console.log("initializing memory store %s".gray, key, config);
  const snapshotTreshold = get(config, "snapshotTreshold") || 50;

  const storeFrames = [];
  const storeSnapshots = [];

  async function heightSinceLastSnapshot() {
    const snapshot = new Query(storeSnapshots).findOne({}, { sort: { height: -1 } }).get();
    let query = {};
    if (snapshot) {
      query = { height: { $gt: snapshot.height } };
    }
    return new Query(storeFrames).find(query).get().length;
  }

  async function triggerSnapshot(height, data, { force = false } = {}) {
    const needSnapshot = force || (await heightSinceLastSnapshot()) >= snapshotTreshold;
    if (needSnapshot) {
      console.log("producing a snapshot for store %s at height %d".cyan, key, height);
      storeSnapshots.push({ height, data, ts: new Date().getTime() });
    }
  }

  const publisher = {
    subscribe(observer) {
      return Observable.of(storeFrames).subscribe(observer);
    },
  };

  const stateFactory = function ({ initialState, height, locale = "en" } = {}) {
    console.log("constructing state for store %s".gray, key, initialState, height);

    const state = {
      locale,
      draft() {
        return createDraft(this.data);
      },
      commit(draft) {
        this.height++;
        try {
          this.data = finishDraft(draft, patches => {
            storeFrames.push({
              height: this.height,
              ts: new Date().getTime(),
              locale,
              patches,
            });
          });

          // check if we need to create a snapshot
          triggerSnapshot(this.height, this.data);
        } catch (err) {
          console.error(err);
        }
      },
      rollback() {
        // noop
      },
      selector(expr) {
        const qb = queryBuilder(this.data, publisher);
        if (expr) {
          return qb.selector(expr);
        }
        return qb;
      },
    };

    console.log("preparing state from raw frames", storeFrames, storeSnapshots);

    const snapshot = new Query(storeSnapshots)
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

    console.log("loaded base data", data);

    // retrieve all frames since snapshot (or 0)
    console.log("selecting frames using query", frameQuery, storeFrames);
    const frames = new Query(storeFrames).find(frameQuery).sort({ height: -1 }).get();
    console.log("applying additional frames", frames);

    if (frames.length > 0) {
      state.data = frames.reduce((state, frame) => applyPatches(state, frame.patches), data);
      state.height = last(frames).height;
    } else {
      state.data = data;
      state.height = snapshot.length > 0 ? snapshot[0].height : height || 0;
    }

    console.log("final state data", state.data);

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
    async loadState(context) {
      return stateFactory(context);
    },
    async injectSnapshot(snapshot) {
      if (!snapshot.ts) {
        snapshot.ts = new Date().getTime();
      }
      console.log("injecting snapshot", snapshot);
      const targetIdx = findIndex(storeSnapshots, s => s.height === snapshot.height);
      if (targetIdx !== -1) {
        storeSnapshots[targetIdx] = snapshot;
      } else {
        storeSnapshots.push(snapshot);
      }
    },
    applyConfig(cfg) {
      console.log("applying new config to store memory:", key, cfg);
    },
  };
}
