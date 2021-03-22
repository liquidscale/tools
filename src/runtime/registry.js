import { filter, find } from "rxjs/operators/index.js";
import { Observable } from "rxjs";

export default function (runtime) {
  const components = [];

  runtime.events.pipe(filter(event => event.key.indexOf("component:installed:") === 0)).subscribe(({ key, component }) => {
    if (key.indexOf(":new") !== -1) {
      console.log("registering %s", component.stereotype, component.key);
      components.push(component);
      runtime.events.next({ key: "component:registered", component });
    } else if (key.indexOf(":updated") !== -1) {
      const idx = components.findIndex(c => c.key === component.key && c.stereotype === component.stereotype);
      if (idx !== -1) {
        components[idx] = component;
        runtime.events.next({ key: "component:replaced", component });
      } else {
        runtime.events.error(new Error("detected unregistered modified component:" + component.key));
      }
    }
  });

  runtime.events.pipe(filter(event => event.key.indexOf("component:removed") === 0)).subscribe(({ component }) => {
    console.log("unregistering %s", component.stereotype, component.key);
    removeBy(components, c => c.key === component.key && c.stereotype == component.stereotype);
    runtime.events.next({ key: "component:unregistered", component });
  });

  const queryHandler = (query, { matchDynamicKey } = {}) => component => {
    if (!query) {
      return component;
    }

    let match = true;

    if (query.stereotype) {
      match &= query.stereotype === component.stereotype;
    }

    if (match && query.key) {
      // If matchdynamic key?
      if (matchDynamicKey) {
        // partial match. we need to match all dynamic instance for scopes for examples: ex: chatroom:room should match chatroom:room:$id
        match &= component.key.indexOf(query.key) === 0;
      } else {
        match &= component.key === query.key;
      }
    }

    return match;
  };

  return {
    components() {
      return Observable.of(components);
    },
    selectComponents(query, options) {
      return this.components.pipe(filter(queryHandler(query, options)));
    },
    selectComponent(query, options) {
      return this.components.pipe(find(queryHandler(query, options)));
    },
    findComponent(query, options) {
      return components.find(queryHandler(query, options));
    },
    findComponents(query, options) {
      return components.filter(queryHandler(query, options));
    },
  };
}
