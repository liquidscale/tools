import { ReplaySubject } from "rxjs";

export default function (config) {
  const components = new ReplaySubject();

  return {
    components,
    register(comp) {
      components.next(comp);
    },
    async findComponents(query) {
      return [];
    },
  };
}
