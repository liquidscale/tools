import rxdb from "rxdb";
import { createDraft, finishDraft, enablePatches, applyPatches, enableMapSet } from "immer";
import memoryAdapter from "pouchdb-adapter-memory";
import { queryBuilder } from "./query-builder.js";
import lodash from "lodash";

const { createRxDatabase, addRxPlugin } = rxdb;
const { last, get } = lodash;

addRxPlugin(memoryAdapter);
enablePatches();
enableMapSet();

export default async function (key, config, runtime) {
  const snapshotTreshold = get(config, "snapshotTreshold") || 50;

  const DB = await createRxDatabase({
    name: key,
    adapter: "memory",
  });

  const storeState = await DB.addCollections({
    frames: {
      schema: {
        title: "store frame",
        version: 0,
        type: "object",
        properties: {
          height: {
            type: "number",
          },
          ts: {
            type: "number",
          },
          patches: {
            type: "object",
          },
        },
        indexes: ["height"],
      },
    },
    snapshots: {
      schema: {
        title: "store snapshots",
        version: 0,
        type: "object",
        properties: {
          height: {
            type: "number",
          },
          state: {
            type: "object",
          },
          ts: {
            type: "number",
          },
        },
        indexes: ["height"],
      },
    },
  });

  async function heightSinceLastSnapshot() {
    const snapshot = await storeState.snapshots.findOne({ selector: {} }).sort({ height: -1 }).exec();
    let query = {};
    if (snapshot) {
      query = { height: { $gt: snapshot.height } };
    }
    return (await storeState.snapshots.find({ selector: query }).exec()).length;
  }

  async function triggerSnapshot(height, data, { force = false } = {}) {
    const needSnapshot = force || (await heightSinceLastSnapshot()) >= snapshotTreshold;
    if (needSnapshot) {
      console.log("producing a snapshot for store %s at height %d", key, height);
      await storeState.snapshots.insert({ height, data, ts: new Date().getTime() });
    }
  }

  const publisher = {
    subscribe(observer) {
      return storeState.frames.find().$.subscribe(observer);
    },
  };

  const stateFactory = async function ({ initialState = {}, height = 0, locale = "en" } = {}) {
    const state = {
      height,
      locale,
      async draft() {
        return createDraft(this.data);
      },
      commit(draft) {
        this.height++;
        try {
          const data = finishDraft(draft, patches => {
            storeState.frames.insert({
              height: this.height,
              ts: new Date().getTime(),
              patches,
            });
          });

          // check if we need to create a snapshot
          triggerSnapshot(this.height, data);
        } catch (err) {
          console.error(err);
        }
      },
      rollback() {
        // noop
      },
      selector(expr) {
        return queryBuilder(this.data, publisher).selector(expr);
      },
    };

    const snapshot = await storeState.snapshots
      .findOne({ selector: { height: { $lte: height } } })
      .sort("height")
      .exec();

    const frameQuery = {};
    if (snapshot) {
      frameQuery.height = { $gt: snapshot.height, locale };
    } else {
      frameQuery.height = { $gte: height, locale };
    }

    const data = snapshot ? snapshot.data || {} : initialState || {};

    // retrieve all frames since snapshot (or 0)
    const frames = await storeState.frames.find({ selector: frameQuery }).sort("height").exec();

    if (frames.length > 0) {
      console.log("applying frames", frames);
      state.data = frames.reduce((state, frame) => applyPatches(state, frame.patches), data);
      state.height = last(frames).height;
    } else {
      state.data = data;
      state.height = snapshot ? snapshot.height : height;
    }

    return state;
  };

  return {
    key,
    stereotype: "store",
    async initState(initialState) {
      // create an initial snapshot
      if (initialState) {
        await triggerSnapshot(0, initialState);
      }
      return stateFactory({ initialState, height: 0 });
    },
    async loadState(context) {
      return stateFactory(context);
    },
  };
}
