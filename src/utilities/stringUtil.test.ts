import { describe, expect, it } from "vitest";
import { QRL_EXAMPLE_ADDRESS, QRL_EXAMPLE_ADDRESS_3 } from "@/constants/address";
import AddressUtil from "./addressUtil";
import StringUtil from "./stringUtil";

const splitAddressBody = (address: string, splitLength = 5) =>
  address.slice(1).match(new RegExp(`.{1,${splitLength}}`, "g")) ?? [];

describe("stringUtil", () => {
  it("should split the address with default split length of 5", () => {
    const accountAddress = QRL_EXAMPLE_ADDRESS;
    const displayAddress = AddressUtil.toChecksumQrlAddress(accountAddress);
    const expectedSplitAddress = splitAddressBody(displayAddress).join(" ");
    const { prefix, addressSplit } = StringUtil.getSplitAddress(accountAddress);

    expect(prefix).toBe("Q");
    expect(addressSplit.join(" ")).toBe(expectedSplitAddress);
  });

  it("should split the address with the given length of 8", () => {
    const accountAddress = QRL_EXAMPLE_ADDRESS;
    const displayAddress = AddressUtil.toChecksumQrlAddress(accountAddress);
    const expectedSplitAddress = splitAddressBody(displayAddress, 8).join(" ");
    const { prefix, addressSplit } = StringUtil.getSplitAddress(
      accountAddress,
      8,
    );

    expect(prefix).toBe("Q");
    expect(addressSplit.join(" ")).toBe(expectedSplitAddress);
  });

  it("should split the address to array of strings", () => {
    const address = QRL_EXAMPLE_ADDRESS_3;
    const expectedPrefix = "Q";
    const expectedAddressSplit = splitAddressBody(
      AddressUtil.toChecksumQrlAddress(address),
    );
    expect(StringUtil.getSplitAddress(address).prefix).toEqual(expectedPrefix);
    expect(StringUtil.getSplitAddress(address).addressSplit).toEqual(
      expectedAddressSplit,
    );
  });

  it("should return the SHAKE256 checksum address for display", () => {
    expect(StringUtil.getDisplayAddress(QRL_EXAMPLE_ADDRESS)).toBe(
      AddressUtil.toChecksumQrlAddress(QRL_EXAMPLE_ADDRESS),
    );
  });

  it("should leave non-address strings unchanged for display", () => {
    expect(StringUtil.getDisplayAddress("0x1234")).toBe("0x1234");
  });
});
