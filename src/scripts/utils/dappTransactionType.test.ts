// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  isSupportedTransactionType,
  unsupportedTransactionTypeMessage,
} from "./dappTransactionType";

describe("isSupportedTransactionType", () => {
  it.each([undefined, null, "0x2", "0x02", "0X2", 2])("accepts %j", (type) => {
    expect(isSupportedTransactionType(type)).toBe(true);
  });

  it.each(["0x0", "0x1", "0x3", "0x20", "0x", "", "2", 0, 1, 3, true, {}])(
    "refuses %j",
    (type) => {
      expect(isSupportedTransactionType(type)).toBe(false);
    },
  );
});

describe("unsupportedTransactionTypeMessage", () => {
  it("names the type that was asked for", () => {
    expect(unsupportedTransactionTypeMessage("0x0")).toBe(
      'QRL transactions are of type 0x2. Received type: "0x0"',
    );
  });
});
