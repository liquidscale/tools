import mocha from "mocha";
const { describe, it } = mocha;
import { expect } from "chai";
import sinon from "sinon";
import { queryBuilder } from "../../../src/runtime/stores/query-builder.js";

const USER = {
  username: "u1",
};

const DATA = {
  users: [{ username: "u1" }, { username: "u2" }, { username: "u3" }],
  chatrooms: [
    {
      title: "room1",
      members: [{ username: "u1" }, { username: "u2" }],
    },
    {
      title: "room2",
      members: [{ username: "u1" }, { username: "u3" }],
    },
  ],
};

let publisher = {
  subscribe: sinon.stub(),
};

describe("query-builder", function () {
  it("extracts chatroom collection", function () {
    const result = queryBuilder(DATA, publisher).selector("$.chatrooms").result();
    expect(result.length).to.equal(2);
    expect(result[0].title).to.equal("room1");
    expect(result[1].title).to.equal("room2");
  });

  it("extracts chatroom collection and filter only room1", function () {
    const result = queryBuilder(DATA, publisher).selector("$.chatrooms").query({ title: "room1" }).result();
    expect(result.length).to.equal(1);
    expect(result[0].title).to.equal("room1");
  });

  it("extracts chatroom collection and filter only room1 as object", function () {
    const result = queryBuilder(DATA, publisher).selector("$.chatrooms").query({ title: "room1" }).result({ single: true });
    expect(result.title).to.equal("room1");
  });

  it("extracts rooms for u1", function () {
    const result = queryBuilder(DATA, publisher)
      .selector("$.chatrooms")
      .query(room => room.members.find(m => m.username === "u1"))
      .result();
    expect(result.length).to.equal(2);
  });

  it("extracts rooms for u2", function () {
    const result = queryBuilder(DATA, publisher)
      .selector("$.chatrooms")
      .query(room => room.members.find(m => m.username === "u2"))
      .result();
    expect(result.length).to.equal(1);
  });
  it("return a single user", function () {
    const result = queryBuilder(USER, publisher).result();
    console.log(result);
    expect(result).to.equal(USER);
  });
});
