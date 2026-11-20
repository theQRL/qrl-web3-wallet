// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  callDataProblem,
  hasInputField,
  withCallDataAsData,
} from "./dappTransactionCallData";

const CALL =
  "0xa9059cbb00000000000000000000000000000000000000000000000000000000000000ff";

describe("callDataProblem", () => {
  it.each([
    ["no call data", { to: "Q01" }],
    ["data only", { data: CALL }],
    ["input only", { input: CALL }],
    ["both, the same bytes", { data: CALL, input: CALL }],
    [
      "both, in another case",
      { data: CALL.toUpperCase().replace("0X", "0x"), input: CALL },
    ],
    ["a null input", { data: CALL, input: null }],
    ["a null data beside an input", { data: null, input: CALL }],
    ["no transaction", undefined],
    ["a transaction that is no object", "0x"],
  ])("finds nothing wrong with %s", (_label, transaction) => {
    expect(callDataProblem(transaction)).toBeUndefined();
  });

  it.each([
    ["other bytes", { data: "0x01", input: CALL }],
    ["an empty data beside an input", { data: "0x", input: CALL }],
    ["an input beside an empty data", { data: CALL, input: "0x" }],
    ["a data that is no text", { data: 1, input: CALL }],
  ])("refuses data and input that differ: %s", (_label, transaction) => {
    expect(callDataProblem(transaction)).toBe(
      '"data" and "input" are both set and differ',
    );
  });

  it.each([1, true, {}, [CALL]])("refuses an input of %j", (input) => {
    expect(callDataProblem({ input })).toBe('"input" has to be a hex string');
  });
});

describe("withCallDataAsData", () => {
  it("moves call data that came as input to data", () => {
    expect(withCallDataAsData({ to: "Q01", gas: "0x1", input: CALL })).toEqual({
      to: "Q01",
      gas: "0x1",
      data: CALL,
    });
  });

  it.each([
    ["absent", {}],
    ["null", { data: null }],
    ["undefined", { data: undefined }],
  ])("fills a data that is %s", (_label, fields) => {
    expect(withCallDataAsData({ ...fields, input: CALL })).toEqual({
      data: CALL,
    });
  });

  it("keeps the data it was given and drops an equal input", () => {
    const data = CALL.toUpperCase().replace("0X", "0x");

    expect(withCallDataAsData({ data, input: CALL })).toEqual({ data });
  });

  it("drops an input that names nothing", () => {
    expect(
      withCallDataAsData({ to: "Q01", value: "0x1", input: null }),
    ).toEqual({
      to: "Q01",
      value: "0x1",
    });
  });

  it.each([
    ["has no input", { to: "Q01", data: CALL }],
    ["has data and input that differ", { data: "0x01", input: CALL }],
    ["has an input that is no text", { input: 1 }],
    ["is no object", "0x"],
    ["is missing", undefined],
  ])("leaves a transaction alone that %s", (_label, transaction) => {
    expect(withCallDataAsData(transaction)).toBe(transaction);
  });
});

describe("hasInputField", () => {
  it.each([
    [{ input: CALL }, true],
    [{ input: "0x" }, true],
    [{ input: 1 }, true],
    [{ data: CALL }, false],
    [{ input: null }, false],
    [{ input: undefined }, false],
    [undefined, false],
  ])("reads %j as %s", (transaction, expected) => {
    expect(hasInputField(transaction)).toBe(expected);
  });
});
