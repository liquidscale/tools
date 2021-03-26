import lodash from "lodash";
import Ajv from "ajv";

const { isString } = lodash;

export default function (schemaSpec, runtime) {
  let spec = schemaSpec;
  if (isString(schemaSpec)) {
    spec = runtime.findComponent({ stereotype: "schema", key: schemaSpec });
  }

  const ajv = new Ajv.default({ strict: false });
  const validate = ajv.compile(spec);

  return {
    getField(key) {
      return null;
    },
    normalize(data) {
      const valid = validate(data);
      if (valid) {
        return [data, null];
      } else {
        return [null, validate.errors];
      }
    },
  };
}
