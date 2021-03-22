import lodash from "lodash";

const { isString } = lodash;

export default function (schemaSpec, runtime) {
  let spec = schemaSpec;
  if (isString(schemaSpec)) {
    spec = runtime.findComponent({ stereotype: "schema", key: schemaSpec });
  }

  return {
    getField(key) {
      return null;
    },
  };
}
