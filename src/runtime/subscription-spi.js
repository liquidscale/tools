import shortid from "shortid-36";
import { BehaviorSubject } from "rxjs";

export default function (scope, pub, spec, runtime) {
  console.log("creating subscription on pub", pub, scope.key, spec, runtime);

  const _sub = {
    id: shortid.generate(),
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
  const subscription = pub.$.subscribe(event => {
    if (event) {
      if (event.result && _sub.cache) {
        console.log("updating our cache", event.result);
        // TODO: We filter out any non-cached fields
        cachedState.next({ $ref: _sub.id, ...event.result });
      }
    }
  });

  return {
    mount(path) {
      console.log("mounting subscription", _sub, "on path", path);
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
