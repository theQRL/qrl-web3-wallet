// @vitest-environment node
import { describe, expect, it } from "vitest";
import { utils } from "@theqrl/web3";
import {
  QUANTA_DECIMALS,
  quantaToPlanck,
  toTokenBaseUnits,
} from "./toTokenBaseUnits";

describe("toTokenBaseUnits", () => {
  it.each([
    [1.1, 18, 1100000000000000000n],
    [0.07, 2, 7n],
    [0.1, 18, 100000000000000000n],
    [4.35, 2, 435n],
    [1234.5678, 4, 12345678n],
    [1, 18, 1000000000000000000n],
    [0, 18, 0n],
    [5, 0, 5n],
    [123456789, 6, 123456789000000n],
    [0.000001, 6, 1n],
    [1e-7, 18, 100000000000n],
    [1.5e-7, 8, 15n],
    [1e21, 18, 10n ** 39n],
    [2.5e21, 2, 25n * 10n ** 22n],
  ])("converts %d with %d decimals to %d", (amount, decimals, expected) => {
    expect(toTokenBaseUnits(amount, decimals)).toBe(expected);
  });

  it.each([
    ["1.1", 18, 1100000000000000000n],
    ["0.07", 2, 7n],
    ["7", 0, 7n],
    [".5", 1, 5n],
    ["5.", 0, 5n],
    [" 2.50 ", 2, 250n],
    ["1e3", 0, 1000n],
    ["1.5E-7", 8, 15n],
    ["0", 18, 0n],
    ["0.000", 2, 0n],
    ["1.50", 1, 15n],
    // More digits than a number holds: the text keeps every one of them.
    ["123456789.123456789", 18, 123456789123456789000000000n],
    ["0.123456789012345678", 18, 123456789012345678n],
  ])(
    "converts the text %j with %d decimals to %d",
    (amount, decimals, expected) => {
      expect(toTokenBaseUnits(amount, decimals)).toBe(expected);
    },
  );

  it("keeps the digits of a long amount that a number rounds away", () => {
    expect(toTokenBaseUnits(Number("123456789.123456789"), 18)).toBe(
      123456789123456790000000000n,
    );
    expect(toTokenBaseUnits("123456789.123456789", 18)).toBe(
      123456789123456789000000000n,
    );
  });

  it("differs from floating point multiplication where that one is wrong", () => {
    expect(BigInt(1.1 * 10 ** 18)).toBe(1100000000000000128n);
    expect(toTokenBaseUnits(1.1, 18)).toBe(1100000000000000000n);
    expect(() => BigInt(0.07 * 10 ** 2)).toThrow(RangeError);
    expect(toTokenBaseUnits(0.07, 2)).toBe(7n);
  });

  it.each([
    [1.234, 2],
    [0.5, 0],
    [1e-7, 6],
    [1.5e-7, 7],
  ])("refuses %d for a token with %d decimals", (amount, decimals) => {
    expect(() => toTokenBaseUnits(amount, decimals)).toThrow(
      `The amount has more than ${decimals.toString()} decimal places`,
    );
  });

  it.each([
    -1,
    -0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "",
    " ",
    ".",
    "-1",
    "+1",
    "1,5",
    "1 000",
    "0x10",
    "e5",
    "abc",
    "1.2.3",
  ])("refuses the amount %j", (amount) => {
    expect(() => toTokenBaseUnits(amount, 18)).toThrow(
      "The amount must be a number of zero or more",
    );
  });

  it.each([
    ["1e-100000000", 18, "The amount has more than 18 decimal places"],
    [`1e-${"9".repeat(400)}`, 18, "The amount has more than 18 decimal places"],
    ["1e100000000", 18, "The amount is too large"],
    [`1e${"9".repeat(400)}`, 18, "The amount is too large"],
    ["1e60", 18, "The amount is too large"],
    ["9".repeat(79), 0, "The amount is too large"],
    // Too large as well when it is written with decimal places, all zero.
    [`1${"0".repeat(79)}.0`, 0, "The amount is too large"],
    [`${"9".repeat(79)}.000`, 2, "The amount is too large"],
  ])(
    "refuses %s at once, whatever the size of its exponent",
    (amount, decimals, message) => {
      expect(() => toTokenBaseUnits(amount, decimals)).toThrow(message);
    },
  );

  it.each([
    ["0e-100000000", 18, 0n],
    ["0.0e999999999", 18, 0n],
    ["1e59", 18, 10n ** 77n],
    ["9".repeat(78), 0, BigInt("9".repeat(78))],
    [`${"9".repeat(78)}.0`, 0, BigInt("9".repeat(78))],
  ])(
    "converts %s at the edge of what a token amount can be",
    (amount, decimals, expected) => {
      expect(toTokenBaseUnits(amount, decimals)).toBe(expected);
    },
  );

  it("refuses text with more decimal places than the token has", () => {
    expect(() => toTokenBaseUnits("0.0000000000000000001", 18)).toThrow(
      "The amount has more than 18 decimal places",
    );
  });

  it.each([-1, 1.5, Number.NaN])("refuses %d as decimals", (decimals) => {
    expect(() => toTokenBaseUnits(1, decimals)).toThrow(
      "The token's decimals must be a whole number",
    );
  });
});

describe("quantaToPlanck", () => {
  it("uses the library's size of one quanta", () => {
    expect(10n ** BigInt(QUANTA_DECIMALS)).toBe(
      BigInt(utils.toPlanck("1", "quanta")),
    );
  });

  it.each([
    ["1.1", 1100000000000000000n],
    ["0.123456789012345678", 123456789012345678n],
    // The library refuses these two as numbers, since they print as 1e-7.
    ["0.0000001", 100000000000n],
    [0.0000001, 100000000000n],
    [2.5, 2500000000000000000n],
  ])("converts %j quanta to %d planck", (amount, expected) => {
    expect(quantaToPlanck(amount)).toBe(expected);
  });
});
