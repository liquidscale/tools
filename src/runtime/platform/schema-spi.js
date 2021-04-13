import lodash from "lodash";
import Ajv from "ajv";
import ajvKeywords from "ajv-keywords";

const { isString, get } = lodash;

export default function (schemaSpec, runtime) {
  if (!schemaSpec) return;

  let spec = schemaSpec;
  if (isString(schemaSpec)) {
    spec = runtime.resolve({ stereotype: "schema", key: schemaSpec });
  }

  async function loadSchema(ref) {
    console.log("resolving ref", ref);
    return {};
  }

  const ajv = new Ajv.default({ strict: false, strictSchema: false, loadSchema });
  ajvKeywords(ajv);
  ajv.addFormat("date-time", {
    validate: dateTimeString => dateTimeString,
  });

  ajv.addKeyword({
    keyword: "$subscription",
    type: "object",
    code(cxt) {},
    metaSchema: {
      anyOf: [
        {
          type: "string",
        },
        {
          type: "object",
          properties: {
            scope: { type: "string" },
            publication: { type: "string", default: "default" },
            selector: { type: "string", default: "$" },
            expression: { type: "object" },
            height: { type: "number" },
          },
          required: ["scope"],
          additionalItems: false,
        },
      ],
    },
  });

  return {
    getField(key) {
      const field = get(schemaSpec, key);
      if (field && field.$subscription) {
        return field.$subscription;
      } else if (field && field.type === "array" && field.items.$subscription) {
        return field.items.$subscription;
      } else {
        return field;
      }
    },
    async normalize(data) {
      try {
        const schemaSpec = await spec;
        const validate = await ajv.compileAsync(schemaSpec);
        const valid = validate(data);
        if (valid) {
          return [data, null];
        } else {
          return [null, validate.errors];
        }
      } catch (err) {
        return [null, [err]];
      }
    },
  };
}
