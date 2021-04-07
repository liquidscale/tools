import mocha from "mocha";
const { describe, it } = mocha;
import { expect } from "chai";
import { Collection } from "../../../src/runtime/platform/collection.js";
import { BehaviorSubject } from "rxjs";

const sub1 = new BehaviorSubject({ $ref: { id: "sub1" }, value: 1, active: true });
const sub2 = new BehaviorSubject({ $ref: { id: "sub2" }, value: 2, active: false });
const sub3 = new BehaviorSubject({ $ref: { id: "sub3" }, value: 3, force: "max" });

describe("collection", function () {
  let collection = null;
  beforeEach(() => {
    collection = Collection();
  });

  afterEach(() => {
    collection.close();
  });

  it("should support push and indexed access", function () {
    collection.push(sub1);
    collection.push("hello");
    const s1 = collection[0];
    const e2 = collection[1];
    expect(s1).to.equal(sub1.getValue());
    expect(e2).to.equal("hello");
  });

  it("should be iterable", function () {
    collection.push(sub1);
    collection.push("hello");
    for (let s of collection) {
      console.log(s);
      expect(s).not.to.be.undefined;
    }
  });

  it("should be stringified with current values", function () {
    collection.push(sub1);
    collection.push(sub2);
    collection.push(sub3);
    collection.push("hello");

    const result = JSON.stringify(collection);
    expect(result).to.be.a("string");
  });

  it("should handle new subscription value and produce different results", function () {
    collection.push(sub1);
    collection.push(sub2);
    collection.push(sub3);
    collection.push("hello");

    const r1 = JSON.stringify(collection);
    sub1.next({ $ref: { id: "sub1" }, value: 1.1, active: true });
    const r2 = JSON.stringify(collection);
    console.log(r2);
  });

  it("should monitor all changes in subscription and expose an observable interface", function () {
    collection.push(sub1);
    collection.push(sub2);

    collection.subscribe(values => {
      if (values) {
        console.log("received values", values);
      }
    });

    collection.push(sub3);
    sub2.next({ $ref: { id: "sub2" }, value: 2.1, active: false });
  });
});
