import jp from "jsonpath";
import Query from "./mongo-query.js";
import lodash from "lodash";
import { BehaviorSubject } from "rxjs";
import { logger } from "./logger.js";
import { hri } from "human-readable-ids";

const { isFunction, isArray, reduce, isObject } = lodash;

export function queryBuilder(data, publisher, { selector, query, single, id } = {}) {
  id = id || hri.random();
  const log = logger.child({ internal: true, module: "query-builder", id });

  function normalizeField(field) {
    if (field) {
      if (field._lqsColl) {
        return field.toArray();
      }

      if (isObject(field)) {
        return reduce(
          field,
          (obj, val, key) => {
            obj[key] = normalizeField(val);
            return obj;
          },
          field
        );
      } else if (Array.isArray(field)) {
        return field.map(normalizeField);
      } else {
        return field;
      }
    }
  }

  function result(options = {}, result) {
    if (!result) {
      result = data;
    }

    if (options.single && isArray(data) && data.length > 0) {
      result = data[0];
    }

    if (isArray(data)) {
      if (query.options.sort) {
      }

      if (query.options.skip) {
      }

      if (query.options.limit) {
      }
    }

    if (result) {
      return normalizeField(result);
    }
  }

  return {
    id,
    selector(expr) {
      if (expr) {
        const result = jp.query(data, expr);
        if (result.length > 0) {
          return queryBuilder(result[0], publisher, { selector: expr, query, id, single });
        } else {
          log.debug("nothing could be selected by query", expr, data);
          return queryBuilder(null, publisher, { selector: expr, query, id, single });
        }
      }
      return this;
    },
    query(expression, { sort, limit, skip } = {}) {
      if (Array.isArray(data)) {
        const q = new Query(data);
        if (isFunction(expression)) {
          const result = q.filter(expression).sort(sort).skip(skip).limit(limit).get();
          return queryBuilder(result, publisher, { id, selector, single, query: { expression, options: { sort, limit, skip, single } } });
        } else {
          const result = q.find(expression || {}, { sort, limit, skip }).get();
          return queryBuilder(result, publisher, { id, selector, single, query: { expression, options: { sort, limit, skip, single } } });
        }
      }
      return this;
    },
    result,
    track(configurer) {
      const queryResultTracker = {
        selector,
        cached: data,
        query,
        results: new BehaviorSubject(),
        reload() {
          publisher.refresh();
        },
        snapshot(options = {}) {
          log.trace("computing query result snapshot", this.cached);
          let snapshot = null;

          if (!this.cached) return;

          if (this.selector) {
            snapshot = jp.query(this.cached, this.selector);
            if (snapshot.length > 0) {
              snapshot = snapshot[0];
            }
          }

          if (this.query && Array.isArray(snapshot || this.cached)) {
            snapshot = new Query(snapshot || this.cached).find(this.query.expression, this.query.options).get();
          }

          log.trace("producing snapshot result", snapshot, this.cached);
          return result(options, snapshot || this.cached);
        },
      };

      const stream = publisher.subscribe(newState => {
        log.trace("updating our cached data", newState);
        queryResultTracker.cached = newState.data;
        const result = queryResultTracker.snapshot({ single });
        log.trace("emitting a new query result", JSON.stringify(result, 2, 2));
        queryResultTracker.results.next(result);
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
