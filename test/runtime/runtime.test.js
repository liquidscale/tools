import("colors");
import Promise from "bluebird";
global.Promise = Promise;

import mocha from "mocha";
const { describe, it } = mocha;
import { expect } from "chai";
import { runtimeFactory } from "../../src/runtime/index.js";
import sinon from "sinon";

describe("runtime", function () {
  let runtime;

  beforeEach(() => {
    runtime = runtimeFactory({ test: true }).internal();
  });

  afterEach(() => sinon.reset());

  it("should create a valid dynamic scope", async function () {
    const initialState = { id: "test1", members: [] };
    const cstor = sinon.stub().returnsArg(0);
    const templateScope = await runtime.wrapScope({ key: "test/${id}", initializers: [] }, {}, cstor);
    const dynScope = await templateScope.dynamicScope({}, initialState);
    expect(dynScope.key).to.equal("test/test1");
    expect(dynScope).not.to.be.undefined;
    expect(cstor.callCount).to.equal(1);
  });

  describe("dynamic pattern", function () {
    it("shoud properly parse dynamic pattern", function () {
      const pattern = runtime.dynamicPattern("chatroom/room/${id}");
      expect(pattern).to.equal("chatroom/room*");
    });
  });

  describe("realize key", function () {
    it("should generate a dynamic key from data", function () {
      const key = runtime.realizeKey("chatroom/room/${id}", { id: "room1" });
      expect(key).to.equal("chatroom/room/room1");
    });
  });
});
