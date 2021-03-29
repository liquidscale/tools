export default function signinAction(runtime) {
  const action = {
    key: "security/signin",
    bind: { scope: "security" },
    description: "Validate user credentials and produce an access token",
    schema: runtime.schema({
      properties: {
        username: { type: "string" },
        password: { type: "string" },
        scope: { type: "string", default: "*" },
      },
      required: ["username", "password"],
    }),
  };

  runtime.registry.addComponent(action);

  /**
   * Builtin authenticateion action. The implementation is coupled with security scope features like helpers
   */
  runtime.actions.subscribe(action.key, async function (req) {
    // validate action payload
    const [payload, errors] = action.schema.normalize(req.data);
    if (errors) {
      return req.channel.error({ message: "validation error", code: 100, errors });
    }

    // bind to our target scope (if specified)
    const scope = await runtime.resolve({ stereotype: "scope", key: "security" });

    // execute our action in the context of the security scope
    // security? this should be done through a secure subscription to ensure we know who the caller is
    const [result, error] = await scope.executeInContext(
      action,
      payload,
      // generateCredentials effect
      async function generateCredentials({ data }, state, { helpers, errors }) {
        const { ActionError } = errors;
        const sub = state.users.find(u => u.username === data.username);
        if (sub) {
          // verify password
          const match = await helpers.verifyPassword(data.password, sub.password);
          if (match) {
            // generate the jwt token
            const token = await helpers.jwtSign(sub, data.scope);

            return { type: "auth", data: { token } };
          } else {
            throw new ActionError({ message: "unauthorized", code: 401 });
          }
        } else {
          throw new ActionError({ message: "unauthorized", code: 401 });
        }
      },
      req.context,
      { readOnly: true }
    );

    if (error) {
      req.channel.error(error);
    } else {
      req.channel.emit(result.data || result, result.type);
    }
  });
}
