export default function (runtime) {
  return function ({ op, path, comp }) {
    if (op === "remove") {
      console.log("removing component ", path);
      runtime.unregister(path);
    }
    return comp;
  };
}
