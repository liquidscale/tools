import rxdb from "rxdb";
import md5 from "md5";
import { createDraft, finishDraft, enablePatches, enableMapSet } from "immer";
import memoryAdapter from "pouchdb-adapter-memory";

const { createRxDatabase, addRxPlugin } = rxdb;

addRxPlugin(memoryAdapter);
enablePatches();
enableMapSet();

export default function (key, config, runtime) {
  const DB = createRxDatabase({
    name: key,
    adapter: "memory",
  });

  //TODO: save state to rxdb memory db
  const _state = {
    height: 0,
    data: {},
    frames: [],
    hash: md5(JSON.stringify({})),
    draft() {
      return createDraft(this.data);
    },
    commit(draft) {
      this.height++;
      try {
        const data = finishDraft(draft, patches => {
          this.frames.push({
            height: this.height,
            ts: new Date(),
            patches,
          });
        });
        this.data = data;
        this.hash = md5(JSON.stringify(this.data));
      } catch (err) {
        console.error(err);
      }
    },
    rollback() {
      // noop
    },
  };

  return {
    key,
    stereotype: "store",
    async initState(initialState) {
      _state.data = initialState || {};
      _state.hash = md5(JSON.stringify(_state.data));
      _state.frames = [];
      return _state;
    },
    async loadState(context) {
      //TODO: Support context
      return _state;
    },
    async saveState() {},
  };
}
