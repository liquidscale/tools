import jp from "jsonpath";
import Query from "./mongo-query.js";
import lodash from "lodash";
import { Subject } from "rxjs";
import { applyPatches } from "immer";

const { isFunction } = lodash;

export function queryBuilder(data, publisher, { selector, query } = {}) {
  return {
    selector(expr) {
      if (expr) {
        const result = jp.query(data, expr);
        console.log("selected data", result);
        return queryBuilder(result, publisher, { selector: expr, query });
      }
      return this;
    },
    query(expression, { sort, limit, skip } = {}) {
      const result = new Query(data).find(expression, { sort, limit, skip }).get();
      console.log("executed query", result);
      return queryBuilder(result, publisher, { selector, query: { expression, options: { sort, limit, skip } } });
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
            snapshot = jp.query(this.cached, this.selector);
          }

          if (this.query) {
            snapshot = new Query(snapshot || this.cached).find(this.query.expression, this.query.options).get();
          }

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
