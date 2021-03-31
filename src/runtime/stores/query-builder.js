import jp from "jsonpath";
import Query from "./mongo-query.js";
import lodash from "lodash";
import { Subject } from "rxjs";
import { applyPatches } from "immer";

const { isFunction, isArray } = lodash;

export function queryBuilder(data, publisher, { selector, query } = {}) {
  console.log("query-build", data);

  return {
    selector(expr) {
      if (expr) {
        console.log("selecting specific state branch", expr, data);
        const result = jp.query(data, expr);
        console.log("selected data", result);
        if (result.length > 0) {
          return queryBuilder(result[0], publisher, { selector: expr, query });
        } else {
          console.log("nothing could be selected by query", expr, data);
          return queryBuilder(null, publisher, { selector: expr, query });
        }
      }
      return this;
    },
    query(expression, { sort, limit, skip } = {}) {
      if (expression) {
        const q = new Query(data);
        if (Object.keys(expression).length > 0) {
          const result = q.find(expression, { sort, limit, skip }).get();
          return queryBuilder(result, publisher, { selector, query: { expression, options: { sort, limit, skip } } });
        } else if (isFunction(expression)) {
          const result = q.filter(expression).sort(sort).skip(skip).limit(limit).get();
          return queryBuilder(result, publisher, { selector, query: { expression, options: { sort, limit, skip } } });
        }
      } else {
        return this;
      }
    },
    result(options = {}) {
      if (options.single && isArray(data) && data.length > 0) {
        return data[0];
      }
      return data;
    },
    track(configurer) {
      let queryResultTracker = {
        selector,
        cached: data,
        query,
        results: new Subject(),
        snapshot() {
          let snapshot = null;

          if (!this.cached) return;

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
        console.log("received new results for query ", queryResultTracker.selector, queryResultTracker.query, frames, queryResultTracker.cached);
        if (frames.length > 0) {
          console.log("processing new frames", frames);
          queryResultTracker.cached = frames.reduce((data, frame) => {
            console.log("applying patches from frame", frame.patches);
            return applyPatches(data, frame.patches);
          }, queryResultTracker.cached);
          queryResultTracker.results.next(queryResultTracker.snapshot());
        } else {
          console.log("nothing new here...");
        }
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
