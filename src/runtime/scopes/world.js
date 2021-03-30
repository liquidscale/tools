export default function (runtime) {
  runtime.config.keyChanged("scopes.world").subscribe(async cfg => {
    let eventKey = "component:installed:";
    let world = await runtime.registry.findComponent({ stereotype: "scope", key: "world" });
    if (!world) {
      console.log("installing world scope".cyan);
      world = await runtime.wrapScope({
        key: "world",
        stereotype: "scope",
      });
      eventKey + "new";
    } else {
      console.log("updating world scope".cyan);
      eventKey + "updated";
    }

    await world.applyConfig(cfg);

    // configure all supported actions

    // mount all named queries

    runtime.events.next({ key: eventKey, component: world });
  });
}
