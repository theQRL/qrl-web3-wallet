// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { KeyStore } from "@theqrl/web3";
import { encrypt } from "@theqrl/web3-qrl-accounts";
import fixtures from "./fixtures/vaults-web3-v1.json";
import { decryptKeystore, passwordBytes } from "./keystoreCompatibility";

// vaults-web3-v1.json was written on the @theqrl/web3 1.0.3 stack (6af685b)
// by encrypt(seed, password.normalize("NFC")) with light KDF costs.
const { seed, vaults } = fixtures;
const typedPasswords = vaults.map((vault) => vault.password);
const nfc = (password: string) => password.normalize("NFC");
const keyBytes = (password: string) =>
  Buffer.from(passwordBytes(nfc(password))).toString("hex");
const opens = async (keystore: KeyStore, password: string) => {
  try {
    return (await decryptKeystore(keystore, nfc(password))).seed === seed;
  } catch {
    return false;
  }
};
const LIGHT_KDF = { m: 19456, t: 2 };

describe("vaults written by the 1.0.3 stack", () => {
  it.each(vaults.map((vault) => [JSON.stringify(vault.password), vault]))(
    "open with the password %s and with exactly the passwords of the same key bytes",
    async (_label, vault) => {
      if (typeof vault === "string") throw new Error("unexpected fixture");
      const keystore = vault.keystore as unknown as KeyStore;
      for (const candidate of [...typedPasswords, `${vault.password}\u0000`]) {
        expect(await opens(keystore, candidate)).toBe(
          keyBytes(candidate) === keyBytes(vault.password),
        );
      }
    },
    120000,
  );

  it("treats one NUL at an edge as part of the typed password, as 1.0.3 did", async () => {
    const keystore = vaults.find((v) => v.password === "pw")
      ?.keystore as unknown as KeyStore;
    expect(await opens(keystore, "pw\u0000")).toBe(true);
    expect(await opens(keystore, "\u0000pw")).toBe(true);
    expect(await opens(keystore, "pw\u0000\u0000")).toBe(false);
    expect(await opens(keystore, "\u0000\u0000pw")).toBe(false);
  }, 60000);
});

describe("vaults written with the 2.0.0 encrypt", () => {
  it.each(
    typedPasswords.map((password) => [JSON.stringify(password), password]),
  )(
    "keep the key bytes of the 1.0.3 writer for the password %s",
    async (_label, password) => {
      const written = await encrypt(
        seed,
        passwordBytes(nfc(password)),
        LIGHT_KDF,
      );
      const old = vaults.find((vault) => vault.password === password);
      expect(await opens(written, password)).toBe(true);
      // The old and the new vault accept the same passwords.
      for (const candidate of typedPasswords) {
        expect(await opens(written, candidate)).toBe(
          await opens(old?.keystore as unknown as KeyStore, candidate),
        );
      }
    },
    120000,
  );
});
