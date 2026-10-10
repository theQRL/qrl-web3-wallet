// @vitest-environment node
import { describe, expect, it } from "vitest";
import { encrypt as encryptAes } from "@theqrl/qrl-cryptography/aes.js";
import { argon2id } from "@theqrl/qrl-cryptography/argon2id.js";
import { decrypt, encrypt, seedToAccount } from "@theqrl/web3-qrl-accounts";
import { bytesToHex } from "@theqrl/web3-utils";
import type { KeyStore } from "@theqrl/web3";
import { ExtendedSeed, Seed, newMLDSA87Descriptor } from "@theqrl/wallet.js";
import { decryptKeystore, reencryptKeystore } from "./keystoreCompatibility";
import { shouldUpgradeKeystoreParams } from "./keystoreParams";
import { getHexSeedFromMnemonic } from "@/functions/getHexSeedFromMnemonic";
import { getMnemonicFromHexSeed } from "@/functions/getMnemonicFromHexSeed";

const seed = ExtendedSeed.newExtendedSeed(
  newMLDSA87Descriptor(),
  new Seed(Uint8Array.from({ length: 48 }, (_, index) => index + 2)),
).toBytes();
const account = seedToAccount(seed);
const password = "test-only vault password";

async function legacyKeystore(memory = 4096): Promise<KeyStore> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await argon2id(
    new TextEncoder().encode(password),
    salt,
    2,
    memory,
    1,
    32,
  );
  try {
    const ciphertext = await encryptAes(seed, key, iv);
    return {
      version: 1,
      id: crypto.randomUUID(),
      address: `Q${account.address.slice(1, 41).toLowerCase()}`,
      crypto: {
        cipher: "aes-256-gcm",
        ciphertext: bytesToHex(ciphertext).slice(2),
        cipherparams: { iv: bytesToHex(iv).slice(2) },
        kdf: "argon2id",
        kdfparams: {
          m: memory,
          t: 2,
          p: 1,
          dklen: 32,
          salt: bytesToHex(salt).slice(2),
        },
      },
    };
  } finally {
    key.fill(0);
  }
}

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
  }, 30000);

  it("recovers old 20-byte vaults and weak KDF settings without relabeling accounts", async () => {
    const keystore = await legacyKeystore();
    const original = JSON.stringify(keystore);
    const restored = await decryptKeystore(keystore, password);
    expect(restored.address).toBe(keystore.address);
    expect(restored.address).toHaveLength(41);
    expect(restored.seed).toBe(account.seed);
    expect(getHexSeedFromMnemonic(getMnemonicFromHexSeed(restored.seed))).toBe(
      account.seed,
    );
    expect(seedToAccount(restored.seed).address).toBe(account.address);
    expect(JSON.stringify(keystore)).toBe(original);
    expect(shouldUpgradeKeystoreParams(keystore)).toBe(true);
    await expect(decrypt(keystore, password)).rejects.toThrow();
    await expect(decryptKeystore(keystore, "wrong password")).rejects.toThrow();
  }, 30000);

  it("checks legacy address metadata and AES authentication", async () => {
    const keystore = await legacyKeystore();
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
    const keystore = { ...(await legacyKeystore()), address: account.address };
    expect((await decryptKeystore(keystore, password)).seed).toBe(account.seed);
    await expect(
      decryptKeystore(
        { ...keystore, address: `Q${"ab".repeat(64)}` },
        password,
      ),
    ).rejects.toThrow("Keystore address does not match its seed");
  }, 30000);

  it("preserves legacy identity through password changes and KDF upgrades", async () => {
    const keystore = await legacyKeystore();
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
    const keystore = await legacyKeystore();
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
