import rxdb from "rxdb";
import { createDraft, finishDraft, enablePatches, applyPatches, enableMapSet } from "immer";
import memoryAdapter from "pouchdb-adapter-memory";
import { queryBuilder } from "./query-builder.js";
import lodash from "lodash";
import Observable from "rxjs";
import { switchMap } from "rxjs/operators/index.js";

const { createRxDatabase, addRxPlugin } = rxdb;
const { last, get } = lodash;

addRxPlugin(memoryAdapter);
enablePatches();
enableMapSet();

export default function (key, config, runtime) {
  console.log("initializing memory store %s".gray, key, config);
  const snapshotTreshold = get(config, "snapshotTreshold") || 50;

  const DB = createRxDatabase({
    name: key,
    adapter: "memory",
  });

  const Collections = (async function () {
    const db = await DB;
    return db.addCollections({
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
            data: {
              type: "object",
            },
          },
          indexes: ["height"],
          required: ["data", "height"],
        },
      },
    });
  })();

  async function heightSinceLastSnapshot() {
    const storeState = await Collections;
    const snapshot = await storeState.snapshots.findOne({ selector: {} }).sort({ height: -1 }).exec();
    let query = {};
    if (snapshot) {
      query = { height: { $gt: snapshot.height } };
    }
    return (await storeState.snapshots.find({ selector: query }).exec()).length;
  }

  async function triggerSnapshot(height, data, { force = false } = {}) {
    const storeState = await Collections;
    const needSnapshot = force || (await heightSinceLastSnapshot()) >= snapshotTreshold;
    if (needSnapshot) {
      console.log("producing a snapshot for store %s at height %d".cyan, key, height);
      await storeState.snapshots.insert({ height, data, ts: new Date().getTime() });
    }
  }

  const publisher = {
    subscribe(observer) {
      return Observable.defer(() => Collections)
        .pipe(switchMap(storeState => storeState.frames.find().$))
        .subscribe(observer);
    },
  };

  const stateFactory = async function ({ initialState = {}, height = 0, locale = "en" } = {}) {
    console.log("constructing state for store %s".gray, key, initialState || config.initialState, height);
    const storeState = await Collections;

    const state = {
      height,
      locale,
      draft() {
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

    const data = snapshot ? snapshot.toJSON().data || {} : initialState || config.initialState || {};

    // retrieve all frames since snapshot (or 0)
    const frames = await storeState.frames.find({ selector: frameQuery }).sort("height").exec();
    console.log("applying additional frames", frames);

    if (frames.length > 0) {
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
    type: "memory",
    stereotype: "store",
    async initState(initialState) {
      console.log("initializing store %s state", key, initialState || config.initialState);

      // create an initial snapshot
      if (initialState || config.initialState) {
        await triggerSnapshot(0, initialState || config.initialState, { force: true });
      }
      return stateFactory({ height: 0 });
    },
    async loadState(context) {
      return stateFactory(context);
    },
    applyConfig(cfg) {
      console.log("applying new config to store memory:", key, cfg);
    },
  };
}
