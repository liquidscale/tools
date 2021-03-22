export default function (runtime) {
  return function ({ op, comp }) {
    if (op !== "remove") {
      comp.instance = (async function (comp) {
        const script = await comp.content;
        return runtime.new(script.code);
      })(comp);

      runtime.register(comp);
    }

    return comp;
  };
}
