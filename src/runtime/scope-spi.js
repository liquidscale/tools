export default function (scope, runtime) {
  return {
    subscribe(subscriptionSpec) {
      console.log("subscribing scope %s to ", scope.key, subscriptionSpec);
      return {};
    },
  };
}
