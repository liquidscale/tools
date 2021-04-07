/**
 * A subscription aware collection that will behave like an array when used inside a scope, but will properly resolve subscription values
 * using either cache or subscription snapshot calls.
 * Only references to subscriptions and cached values are stored with the scope frame, so if a subscription is added or removed, a new frame will
 * be generated in height-based stores.
 */
import { BehaviorSubject } from "rxjs";
import { logger } from "../logger.js";

import lodash from "lodash";
const { isNumber, isNaN, isFunction } = lodash;

const log = logger.child({ module: "collection" });

const checkNumber = function (prop) {
  try {
    const idx = parseInt(prop);
    return isNumber(idx) && !isNaN(idx);
  } catch (err) {
    return false;
  }
};

export function Collection() {
  const subscriptionStreams = [];
  const elements = new BehaviorSubject([]);

  const subscriptionHandler = {
    get(target, prop, receiver) {
      if (checkNumber(prop)) {
        const elm = elements.getValue()[parseInt(prop)];
        if (elm && elm._value) {
          return elm.getValue();
        } else {
          return elm;
        }
      } else if (prop === Symbol.iterator) {
        return function () {
          const iter = elements.getValue()[Symbol.iterator]();
          return {
            next() {
              const elm = iter.next();
              if (elm.value) {
                if (elm.value._value) {
                  return { value: elm.value.getValue(), done: elm.done };
                } else {
                  return elm;
                }
              } else {
                return elm;
              }
            },
          };
        };
      } else if (prop === "length") {
        return elements.getValue().length;
      } else if (prop === Symbol.asyncIterator) {
        return function () {
          const iter = elements.getValue()[Symbol.iterator]();
          return {
            async next() {
              const elm = iter.next();
              if (elm.value) {
                if (elm.value._value) {
                  return { value: await elm.value.getValue(), done: elm.done };
                } else {
                  return elm;
                }
              } else {
                return elm;
              }
            },
          };
        };
      } else if (["filter", "map", "forEach", "reduce"].indexOf(prop) !== -1) {
        return target.elements.getValue().map((e = isFunction(e.getValue) ? e.getValue() : e))[prop];
      }
      return Reflect.get(target, prop, receiver);
    },
  };

  return new Proxy(
    {
      _lqsColl: true,
      push(val) {
        const nextValue = [...elements.getValue()];
        if (val._value) {
          subscriptionStreams.push(
            (function (index) {
              return val.subscribe(value => {
                log.debug("update value at %d", index, value);
                const nextValue = [...elements.getValue()];
                nextValue[index] = value;
                log.trace("producing next value", nextValue);
                elements.next(nextValue);
              });
            })(elements.getValue().length)
          );
          nextValue.push(val);
          elements.next(nextValue);
        } else {
          nextValue.push(val);
          elements.next(nextValue);
        }
      },
      toArray() {
        return elements.getValue().map(v => {
          if (v._value) {
            return v.getValue();
          } else {
            return v;
          }
        });
      },
      toJSON() {
        return elements.getValue().map(v => {
          if (v._value) {
            return v.getValue();
          } else {
            return v;
          }
        });
      },
      close() {
        subscriptionStreams.forEach(s => s.unsubscribe());
      },
      subscribe(observer) {
        log.debug("creating change subscription", observer);
        return elements.subscribe(() => observer(elements.getValue().map(elm => (elm._value ? elm.getValue() : elm))));
      },
    },
    subscriptionHandler
  );
}
