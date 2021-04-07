import { BehaviorSubject } from "rxjs";
import { queryBuilder } from "./stores/query-builder.js";
import jp from "jsonpath";

export default function (spec, scope, runtime) {
  const log = runtime.logger.child({ module: "publication-spi", internal: true, scope: scope.key, key: spec.key });
  const _data = new BehaviorSubject();
  const _tracker = new BehaviorSubject();

  spec.stereotype = spec.stereotype || "publication";

  setTimeout(async function () {
    const [queryTracker, error] = await scope.queryInContext(spec.selector, spec.expression, spec.options, spec.context);
    if (queryTracker) {
      _tracker.next(queryTracker);
      queryTracker.results.subscribe(_data);
    } else if (error) {
      log.error("error", error);
      throw new Error("unable to install publication", spec.key, error);
    }
  }, 500);

  async function handleQuery(query) {
    if (query.target === spec.key) {
      let querySubscription = null;
      if (query.op === "open") {
        log.debug("open query on scope %s using pub %s", scope.key, spec.key, query);
        querySubscription = _data.subscribe(data => {
          if (data) {
            log.debug("refreshing query %s with new data", query.id, JSON.stringify(data, 2, 2));
            const qb = queryBuilder(data);
            const result = qb.selector(query.selector).query(query.expression, query.options).result({ single: query.options.single });
            log.debug("updated query result", JSON.stringify(result, 2, 2));
            query.channel.emit(result);
          }
        });
      } else if (query.op === "snapshot") {
        log.debug("get query snapshot on scope %s using pub %s", scope.key, spec.key, query);
        const data = _data.getValue();
        if (data) {
          const qb = queryBuilder(data, null);
          const result = qb.selector(query.selector).query(query.expression, query.options).result({ single: query.options.single });
          query.channel.emit(result);
        }
      } else if (query.op === "close") {
        log.debug("close query %s from scope %s using pub %s", query.id, scope.key, spec.key);
        if (querySubscription) {
          querySubscription.unsubscribe();
        }
      }
    }
  }

  // Listen for incoming queries for this scope
  runtime.queries.subscribe(scope.key, handleQuery);

  return {
    $: _data,
    key: spec.key,
    subscribe(options = {}) {
      log.debug("creating a new subscription for publication %s", spec.key, options);
      return {};
    },
    refresh(mountpoint) {
      log.debug("force publication refresh for mountpoint %s %s", mountpoint, spec.key, scope.key);
      const data = _data.getValue();
      if (data) {
        const intersection = jp.query(data, mountpoint || "$");
        if (intersection.length > 0) {
          log.debug("refreshing publication data %s(%s)", spec.key, scope.key);
          _tracker.getValue().reload();
        } else {
          log.debug("change not applicable to this publication. skipping");
        }
      }
    },
    executeQuery(query) {
      return handleQuery(query);
    },
  };
}
