export default function (runtime) {
  runtime.config.keyChanged("scopes.organization").subscribe(async cfg => {
    let eventKey = "component:installed:";
    let organization = await runtime.registry.findComponent({ stereotype: "scope", key: "organization" });
    if (!organization) {
      console.log("installing organization scope".cyan);
      organization = await runtime.wrapScope({
        key: "organization",
        stereotype: "scope",
      });
      eventKey + "new";
    } else {
      console.log("updating organization scope".cyan);
      eventKey + "updated";
    }

    await organization.applyConfig(cfg);

    // configure all supported actions

    // mount all named queries

    runtime.events.next({ key: eventKey, component: organization });
  });
}
