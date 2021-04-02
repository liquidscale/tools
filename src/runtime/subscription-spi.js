import shortid from "shortid-36";

export default function (scope, pubKey, spec, runtime) {
  console.log("creating subscription on pub %s of scope %s", pubKey, scope.key, spec);

  const _sub = {
    id: shortid.generate(),
    target: pubKey,
  };

  return {
    mount(path) {
      console.log("mounting subscription", _sub, "on path", path);
    },
    asRef() {
      return {
        $subscription: {
          id: _sub.id,
          scope: scope.key,
        },
      };
    },
  };
}
