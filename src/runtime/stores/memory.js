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

  return {
    key,
    stereotype: "store",
    async initState(initialState) {
      return {
        height: 0,
        data: initialState || {},
        frames: [],
        hash: md5(JSON.stringify(initialState || {})),
        draft() {
          return createDraft(this.data);
        },
        commit(draft) {
          console.log("committing changes");
          this.height++;
          try {
            const data = finishDraft(draft, patches => {
              console.log("creating new frame", patches);
              this.frames.push({
                height: this.height,
                ts: new Date(),
                patches,
              });
            });
            console.log("new data", data);
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
    },
    async saveState() {},
  };
}
