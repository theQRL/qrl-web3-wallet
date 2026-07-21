import {
  QRL_ADDRESS_LENGTH,
  QRL_EXAMPLE_ADDRESS,
  QRL_EXAMPLE_ADDRESS_2,
} from "@/constants/address";
import { describe, expect, it } from "vitest";
import AddressUtil from "./addressUtil";

describe("addressUtil", () => {
  it("accepts 64-byte Q-prefixed QRL addresses", () => {
    expect(QRL_EXAMPLE_ADDRESS).toHaveLength(QRL_ADDRESS_LENGTH);
    expect(AddressUtil.isQrlAddress(QRL_EXAMPLE_ADDRESS)).toBe(true);
    expect(AddressUtil.isQrlAddress(QRL_EXAMPLE_ADDRESS_2)).toBe(true);
  });

  it("validates mixed-case checksum addresses", () => {
    const checksummedAddress =
      "QabaBABabaBAbAbAbABaBABaBabaBabaBAbabaBABABAbAbabababAbaBaBABABabABaBaBABABaBabaBABaBabABAbABabaBAbABAbABAbaBabABababAbaBaBabaBAB";
    const invalidChecksumAddress =
      "QaBababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababab";

    expect(AddressUtil.isQrlAddress(checksummedAddress)).toBe(true);
    expect(AddressUtil.isQrlAddress(invalidChecksumAddress)).toBe(false);
  });

  it("rejects legacy 20-byte QRL addresses as current addresses", () => {
    const legacyAddress = "Q20B714091cF2a62DADda2847803e3f1B9D2D3779";

    expect(AddressUtil.isQrlAddress(legacyAddress)).toBe(false);
    expect(AddressUtil.isLegacyQrlAddress(legacyAddress)).toBe(true);
  });

  it("normalizes only valid current QRL addresses", () => {
    expect(AddressUtil.normalizeQrlAddress(` ${QRL_EXAMPLE_ADDRESS} `)).toBe(
      "Q000000000000000000000000000000000000000000000000000000008a8eAfB1CF62bFbEb1741769DaE1A9dd4799619200000000000000000000000000000000",
    );
    expect(() => AddressUtil.normalizeQrlAddress("Q1234")).toThrow(
      "Expected 129-character QRL address",
    );
  });

  it("converts current QRL addresses to SHAKE256 checksum form", () => {
    expect(AddressUtil.toChecksumQrlAddress(QRL_EXAMPLE_ADDRESS_2)).toBe(
      "Q0000000000000000000000000000000000000000000000000000000000FB08Ff1F1376a14c055e9f56Df80563E16722b00000000000000000000000000000000",
    );
  });

  it("shortens long addresses for compact UI display", () => {
    expect(AddressUtil.shortenQrlAddress(QRL_EXAMPLE_ADDRESS)).toBe(
      "Q000000000...00000000",
    );
  });
});
