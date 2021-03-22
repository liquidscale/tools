import { Subject } from "rxjs";

export default function (key, cfg, runtime) {
  console.log("configuring a memory transport", key, cfg);

  const hub = new Subject();

  return {
    key,
    stereotype: "transport",
  };
}
