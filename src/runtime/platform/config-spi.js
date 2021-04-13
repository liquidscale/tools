import lodash from "lodash";

const { get } = lodash;

export default function (config, runtime) {
  return {
    get(key, defaultValue) {
      return get(config, key) || defaultValue;
    },
  };
}
