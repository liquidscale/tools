import { BehaviorSubject } from "rxjs";

export default function (spec, scope) {
  console.log("installing publication ", spec.key);
  const _state = new BehaviorSubject();

  setTimeout(async function () {
    console.log("connecting publication to scope", scope);
    const [queryTracker, error] = await scope.queryInContext(spec.selector, spec.expression, spec.options, { ...spec.context, priviledged: spec.priviledged });
    if (queryTracker) {
      queryTracker.results.subscribe(result => {
        console.log("received new state for publication %s:%s", scope.key, spec.key, result);
        _state.next({ scope, result });
      });
    } else if (error) {
      console.log("error", error);
      throw new Error("unable to install publication", spec.key, error);
    }
  }, 500);

  return {
    $: _state,
    subscribe() {},
  };
}
