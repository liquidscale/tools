import { BehaviorSubject } from "rxjs";

export default function (spec, scope) {
  const _state = new BehaviorSubject();

  spec.stereotype = spec.stereotype || "publication";

  setTimeout(async function () {
    const [queryTracker, error] = await scope.queryInContext(spec.selector, spec.expression, spec.options, spec.context);
    if (queryTracker) {
      queryTracker.results.subscribe(result => {
        _state.next({ scope, result });
      });
    } else if (error) {
      console.log("error", error);
      throw new Error("unable to install publication", spec.key, error);
    }
  }, 500);

  return {
    $: _state,
    subscribe(options = {}) {
      console.log("creating a new subscription for publication %s", spec.key, options);
      return {};
    },
  };
}
