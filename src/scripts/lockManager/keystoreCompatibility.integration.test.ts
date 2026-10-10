// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, seedToAccount } from "@theqrl/web3-qrl-accounts";
import type { KeyStore } from "@theqrl/web3";
import fixtures from "./fixtures/legacy-vaults.json";
import { decryptKeystore, reencryptKeystore } from "./keystoreCompatibility";
import { shouldUpgradeKeystoreParams } from "./keystoreParams";
import { getHexSeedFromMnemonic } from "@/functions/getHexSeedFromMnemonic";
import { getMnemonicFromHexSeed } from "@/functions/getMnemonicFromHexSeed";

// Encrypted by web3-qrl-accounts 0.5.0 with wallet.js 2.0.2.
const legacy = fixtures.C;
const seed = legacy.expected.seed;
const account = seedToAccount(seed);
const password = legacy.typedPassword;
const legacyKeystore = (): KeyStore =>
  structuredClone(legacy.keystore) as KeyStore;

describe("version 1 keystore compatibility", () => {
  it("round trips new 64-byte vaults through web3 encryption and the compatibility reader", async () => {
    const keystore = await encrypt(seed, password, { m: 19456, t: 2 });
    expect(keystore.version).toBe(1);
    expect(keystore.address).toMatch(/^Q[0-9a-f]{128}$/);
    const restored = await decryptKeystore(
      JSON.parse(JSON.stringify(keystore)),
      password,
    );
    expect(restored.address).toBe(account.address);
    expect(restored.seed).toBe(account.seed);
    expect(shouldUpgradeKeystoreParams(keystore)).toBe(true);
    await expect(decryptKeystore(keystore, "wrong password")).rejects.toThrow();
    await expect(
      decryptKeystore(
        { ...keystore, address: `Q${"ab".repeat(64)}` },
        password,
      ),
    ).rejects.toThrow("Keystore address does not match its seed");
  }, 30000);

  it("recovers old 20-byte vaults and weak KDF settings without relabeling accounts", async () => {
    const keystore = legacyKeystore();
    const original = JSON.stringify(keystore);
    const restored = await decryptKeystore(keystore, password);
    expect(restored.address).toBe(keystore.address);
    expect(restored.address).toHaveLength(41);
    expect(restored.seed).toBe(legacy.expected.seed);
    expect(getMnemonicFromHexSeed(restored.seed)).toBe(
      legacy.expected.mnemonic,
    );
    expect(getHexSeedFromMnemonic(getMnemonicFromHexSeed(restored.seed))).toBe(
      account.seed,
    );
    expect(seedToAccount(restored.seed).address).toBe(account.address);
    expect(JSON.stringify(keystore)).toBe(original);
    expect(shouldUpgradeKeystoreParams(keystore)).toBe(true);
    await expect(decrypt(keystore, password)).rejects.toThrow();
    await expect(decryptKeystore(keystore, "wrong password")).rejects.toThrow();
  }, 30000);

  it.each(Object.values(fixtures))(
    "decrypts the original $label vault and exports its original mnemonic",
    async ({ keystore, typedPassword, expected }) => {
      const restored = await decryptKeystore(
        keystore as KeyStore,
        typedPassword,
      );
      expect(restored.address).toBe(keystore.address);
      expect(restored.address.toLowerCase()).toBe(
        expected.address020.toLowerCase(),
      );
      expect(restored.seed).toBe(expected.seed);
      expect(getMnemonicFromHexSeed(restored.seed)).toBe(expected.mnemonic);
      expect(getHexSeedFromMnemonic(expected.mnemonic)).toBe(expected.seed);
      if (
        expected.seed.startsWith("0x010100") ||
        expected.seed.startsWith("0x010001")
      ) {
        expect(restored.recoveryOnly).toBe(true);
        expect(() => seedToAccount(restored.seed)).toThrow(
          "Descriptor metadata bytes are reserved and must be zero",
        );
      }
      await expect(
        decryptKeystore(keystore as KeyStore, "wrong password"),
      ).rejects.toThrow();
    },
    30000,
  );

  it.each([fixtures.D, fixtures.D2])(
    "authenticates $label before returning a recovery-only seed",
    async ({ keystore, typedPassword, expected }) => {
      const relabeled = await decryptKeystore(
        { ...keystore, address: account.address } as KeyStore,
        typedPassword,
      );
      expect(relabeled).toEqual({
        address: account.address,
        seed: expected.seed,
        recoveryOnly: true,
      });
      const ciphertext = keystore.crypto.ciphertext;
      const tampered = {
        ...keystore,
        crypto: {
          ...keystore.crypto,
          ciphertext:
            ciphertext.slice(0, -2) + (ciphertext.endsWith("00") ? "01" : "00"),
        },
      } as KeyStore;
      await expect(decryptKeystore(tampered, typedPassword)).rejects.toThrow();
    },
    30000,
  );

  it("checks legacy address metadata and AES authentication", async () => {
    const keystore = legacyKeystore();
    await expect(
      decryptKeystore(
        { ...keystore, address: `Q${"ab".repeat(20)}` },
        password,
      ),
    ).rejects.toThrow("Keystore address does not match its seed");
    const ciphertext = keystore.crypto.ciphertext;
    const tampered = {
      ...keystore,
      crypto: {
        ...keystore.crypto,
        ciphertext:
          (ciphertext.startsWith("00") ? "01" : "00") + ciphertext.slice(2),
      },
    };
    await expect(decryptKeystore(tampered, password)).rejects.toThrow();
  }, 30000);

  it("reads a 64-byte address with old KDF parameters and rejects a mismatched address", async () => {
    const keystore = { ...legacyKeystore(), address: account.address };
    expect((await decryptKeystore(keystore, password)).seed).toBe(account.seed);
    await expect(
      decryptKeystore(
        { ...keystore, address: `Q${"ab".repeat(64)}` },
        password,
      ),
    ).rejects.toThrow("Keystore address does not match its seed");
  }, 30000);

  it("preserves legacy identity through password changes and KDF upgrades", async () => {
    const keystore = legacyKeystore();
    const upgraded = await reencryptKeystore(
      keystore,
      account.seed,
      "new test-only password",
    );
    expect(upgraded.address).toBe(keystore.address);
    expect(upgraded.crypto.kdfparams).toMatchObject({
      m: 262144,
      t: 8,
      p: 1,
      dklen: 32,
    });
    expect(shouldUpgradeKeystoreParams(upgraded)).toBe(false);
    const restored = await decryptKeystore(upgraded, "new test-only password");
    expect(restored.address).toBe(keystore.address);
    expect(restored.seed).toBe(account.seed);
  }, 180000);

  it("rejects out-of-range stored KDF costs", async () => {
    const keystore = legacyKeystore();
    for (const m of [4095, 1048577, Number.NaN]) {
      const invalid = {
        ...keystore,
        crypto: {
          ...keystore.crypto,
          kdfparams: { ...keystore.crypto.kdfparams, m },
        },
      };
      await expect(decryptKeystore(invalid, password)).rejects.toThrow(
        "Invalid keystore KDF parameters",
      );
    }
  }, 30000);
});
