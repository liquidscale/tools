import { BehaviorSubject } from "rxjs";
import { hri } from "human-readable-ids";

export default function (scope, pub, spec = {}, runtime) {
  const log = runtime.logger.child({ module: "subscription-spi", internal: true, scope: scope.key, key: spec.key });
  log.debug("creating subscription on pub", pub, scope.key, spec);

  if (!pub) {
    log.warn("trying to subscribe to an undefined publication. Quickly returning without subscribing but might cause scope %s not to be properly refreshed", scope.key);
    return;
  }

  const _sub = {
    id: hri.random(),
    target: pub,
    cache: spec.cache,
  };

  let initialCache = {
    $ref: _sub.id,
  };

  if (spec.cache && spec.cache.data) {
    initialCache = { $ref: _sub.id, ...spec.cache.data };
  }

  const cachedState = new BehaviorSubject(initialCache);

  // connect subscription to publication changes stream
  // TODO: our subscription is anonymous, unknown to the publication. might be worth it to register it with pub for management, etc.
  const subscription = pub.$.subscribe(data => {
    if (data) {
      log.debug("publication %s(%s) has reported changes", pub.key, scope.key, data, { subscription: _sub.id });
      if (_sub.cache) {
        log.debug("updating our cache", data);
        // TODO: We filter out any non-cached fields
        cachedState.next({ $ref: _sub.id, ...data });
      } else {
        cachedState.next({ $ref: _sub.id });
      }
    }
  });

  return {
    mount(path) {
      log.debug("mounting subscription", _sub, "on path", path);
    },
    asRef() {
      return cachedState;
    },
    close() {
      if (subscription) {
        subscription.unsubscribe();
      }
    },
  };
}
