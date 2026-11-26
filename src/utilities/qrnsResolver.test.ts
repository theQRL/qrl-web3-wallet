import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetAddress } = vi.hoisted(() => ({
  mockGetAddress: vi.fn(),
}));

vi.mock("@theqrl/web3", () => ({
  qrl: {
    qrns: {
      QRNS: class {
        getAddress = mockGetAddress;
      },
    },
  },
}));

import { isQrnsName, resolveQrnsName } from "./qrnsResolver";

const RPC = "https://rpc.example";
const CANONICAL =
  "Q000000000000000000000000000000000000000000000000000000008a8eAfB1CF62bFbEb1741769DaE1A9dd4799619200000000000000000000000000000000";
const CANONICAL_0X = "0x" + CANONICAL.slice(1);
const LEGACY_20_BYTE = "Q8a8eafb1cf62bfbeb1741769dae1a9dd47996192";

describe("qrnsResolver", () => {
  beforeEach(() => {
    mockGetAddress.mockReset();
  });

  describe("isQrnsName", () => {
    it("accepts .qrl names and rejects addresses", () => {
      expect(isQrnsName("alice.qrl")).toBe(true);
      expect(isQrnsName("sub.alice.qrl")).toBe(true);
      expect(isQrnsName(" bob.qrl ")).toBe(true);
      expect(isQrnsName(CANONICAL)).toBe(false);
      expect(isQrnsName("alice.eth")).toBe(false);
    });
  });

  describe("resolveQrnsName", () => {
    it("returns a canonical address, converting the 0x prefix to Q", async () => {
      mockGetAddress.mockResolvedValue(CANONICAL_0X);
      await expect(resolveQrnsName("alice.qrl", RPC)).resolves.toBe(CANONICAL);
    });

    it("passes through an already Q-prefixed canonical address", async () => {
      mockGetAddress.mockResolvedValue(CANONICAL);
      await expect(resolveQrnsName("alice.qrl", RPC)).resolves.toBe(CANONICAL);
    });

    // CIPH-QRLW326-4. The resolved value comes from a registry contract reached
    // over the chain's RPC endpoint — neither of which the wallet controls — and
    // it becomes the transaction recipient. Anything that is not a valid address
    // must be refused rather than forwarded to the signer.
    it.each([
      ["a legacy 20-byte address", LEGACY_20_BYTE],
      ["the zero address of the wrong width", "Q" + "0".repeat(40)],
      ["an over-long value", CANONICAL + "ff"],
      ["a truncated value", CANONICAL.slice(0, 60)],
      ["a non-hex value", "Q" + "z".repeat(128)],
      ["an empty string", ""],
      ["a bare 0x", "0x"],
      ["an unrelated string", "not an address"],
    ])("rejects %s returned by the registry", async (_label, returned) => {
      mockGetAddress.mockResolvedValue(returned);
      await expect(resolveQrnsName("alice.qrl", RPC)).rejects.toThrow(
        /invalid QRL address/,
      );
    });

    it("propagates a registry failure rather than returning a value", async () => {
      mockGetAddress.mockRejectedValue(new Error("no contract"));
      await expect(resolveQrnsName("alice.qrl", RPC)).rejects.toThrow(
        "no contract",
      );
    });
  });
});
