// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ExtendedSeed, Seed, newMLDSA87Descriptor } from "@theqrl/wallet.js";
import { encrypt } from "@theqrl/web3-qrl-accounts";
import { bytesToHex } from "@theqrl/web3-utils";
import { decryptKeystore } from "./keystoreCompatibility";

// Throwaway seed, never used outside tests.
const seed = bytesToHex(
  ExtendedSeed.newExtendedSeed(
    newMLDSA87Descriptor(),
    new Seed(Uint8Array.from({ length: 48 }, (_, index) => index + 9)),
  ).toBytes(),
);

describe("keystore passwords with NUL edge characters", () => {
  it.each([
    ["trailing NUL", "test-only password\u0000"],
    ["leading NUL", "\u0000test-only password"],
  ])(
    "reads a keystore written by the current encrypt with a %s password",
    async (_label, password) => {
      const keystore = await encrypt(seed, password);
      expect((await decryptKeystore(keystore, password)).seed).toBe(seed);
      await expect(
        decryptKeystore(keystore, "test-only password"),
      ).rejects.toThrow();
    },
    60000,
  );

  it("reads a keystore whose key was derived from the NUL-stripped password", async () => {
    // The 1.x encrypt derived the key from the stripped form.
    const keystore = await encrypt(seed, "test-only password");
    const decrypted = await decryptKeystore(
      keystore,
      "test-only password\u0000",
    );
    expect(decrypted.seed).toBe(seed);
  }, 60000);
});
