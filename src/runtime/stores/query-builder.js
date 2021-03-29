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
        result: [],
        query,
        results: new Subject(),
      };

      const stream = publisher.subscribe(frames => {
        // apply this frame to our current data
        queryResultTracker.cached = frames.reduce((data, frame) => applyPatches(data, frame.patches), queryResultTracker.cached);

        if (queryResultTracker.selector) {
          queryResultTracker.result = jp.query(queryResultTracker.cached, queryResultTracker.selector);
        }

        if (queryResultTracker.query) {
          queryResultTracker.result = new Query(queryResultTracker.result || queryResultTracker.cached).find(queryResultTracker.query.expression, queryResultTracker.query.options).get();
        }
        console.log("publishing query result", queryResultTracker.result);
        queryResultTracker.results.next(queryResultTracker.result);
      });

      queryResultTracker.cancel = function () {
        stream.unsubscribe();
      };

      if (isFunction(configurer)) {
        queryResultTracker = configurer(queryResultTracker) || queryResultTracker;
      }

      return queryResultTracker;
    },
  };
}
