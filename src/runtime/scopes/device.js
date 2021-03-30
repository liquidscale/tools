export default function (runtime) {
  runtime.config.keyChanged("scopes.device").subscribe(async cfg => {
    let eventKey = "component:installed:";
    let device = await runtime.registry.findComponent({ stereotype: "scope", key: "device" });
    if (!device) {
      console.log("installing device scope".cyan);
      device = await runtime.wrapScope({
        key: "device",
        stereotype: "scope",
      });
      eventKey + "new";
    } else {
      console.log("updating device scope".cyan);
      eventKey + "updated";
    }

    await device.applyConfig(cfg);

    // configure all supported actions

    // mount all named queries

    runtime.events.next({ key: eventKey, component: device });
  });
}
