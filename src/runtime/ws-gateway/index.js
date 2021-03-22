export default function (config, runtime) {
  return {
    connect(actions) {
      console.log("connecting gateway to action stream in runtime ", runtime.id, config);
    },
  };
}
