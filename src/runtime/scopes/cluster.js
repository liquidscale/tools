export default function (runtime) {
  runtime.config.keyChanged("scopes.cluster").subscribe(async cfg => {
    let eventKey = "component:installed:";
    let cluster = await runtime.registry.findComponent({ stereotype: "scope", key: "cluster" });
    if (!cluster) {
      console.log("installing cluster scope".cyan);
      cluster = await runtime.wrapScope({
        key: "cluster",
        stereotype: "scope",
      });
      eventKey + "new";
    } else {
      console.log("updating cluster scope".cyan);
      eventKey + "updated";
    }

    await cluster.applyConfig(cfg);

    // configure all supported actions

    // mount all named queries

    runtime.events.next({ key: eventKey, component: cluster });
  });
}
