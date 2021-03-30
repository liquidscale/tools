import jp from "jsonpath";
import Query from "./mongo-query.js";
import lodash from "lodash";
import { Subject } from "rxjs";
import { applyPatches } from "immer";

const { isFunction, flatten } = lodash;

export function queryBuilder(data, publisher, { selector, query } = {}) {
  console.log("query-build", data);
  return {
    selector(expr) {
      if (expr) {
        console.log("selecting specific state branch", expr);
        const result = jp.query(data, expr);
        console.log("selected data", result);
        if (result) {
          return queryBuilder(result[0], publisher, { selector: expr, query });
        } else {
          return queryBuilder(null, publisher, { selector: expr, query });
        }
      }
      return this;
    },
    query(expression, { sort, limit, skip } = {}) {
      if (expression && Object.keys(expression).length > 0) {
        console.log("filtering data", expression);
        const result = new Query(data).find(expression, { sort, limit, skip }).get();
        return queryBuilder(result, publisher, { selector, query: { expression, options: { sort, limit, skip } } });
      } else {
        return this;
      }
    },
    track(configurer) {
      let queryResultTracker = {
        selector,
        cached: data,
        query,
        results: new Subject(),
        snapshot() {
          let snapshot = null;

          if (this.selector) {
            console.log("applying selector on data", this.selector, snapshot, this.cached);
            snapshot = jp.query(this.cached, this.selector);
          }

          if (this.query) {
            console.log("applying query on data", this.query, snapshot, this.cached);
            snapshot = new Query(snapshot || this.cached).find(this.query.expression, this.query.options).get();
          }

          console.log("produced data snapshot", snapshot);
          return snapshot;
        },
      };

      const stream = publisher.subscribe(frames => {
        this.cached = frames.reduce((data, frame) => applyPatches(data, frame.patches), this.cached);
        queryResultTracker.results.next(queryResultTracker.snapshot());
      });

      queryResultTracker.complete = function () {
        stream.unsubscribe();
      };

      if (isFunction(configurer)) {
        queryResultTracker = configurer(queryResultTracker) || queryResultTracker;
      }

      return queryResultTracker;
    },
  };
}
