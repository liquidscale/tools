export default function (runtime) {
  runtime.config.keyChanged("scopes.library").subscribe(async cfg => {
    let eventKey = "component:installed:";
    let library = await runtime.registry.findComponent({ stereotype: "scope", key: "library" });
    if (!library) {
      console.log("installing library scope".cyan);
      library = await runtime.wrapScope({
        key: "library",
        stereotype: "scope",
      });
      eventKey + "new";
    } else {
      console.log("updating library scope".cyan);
      eventKey + "updated";
    }

    await library.applyConfig(cfg);

    // configure all supported actions

    // mount all named queries

    runtime.events.next({ key: eventKey, component: library });
  });
}
