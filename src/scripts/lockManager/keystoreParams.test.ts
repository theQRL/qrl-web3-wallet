import { describe, expect, it } from "vitest";
import {
  RECOMMENDED_KEYSTORE_KDF_PARAMS,
  shouldUpgradeKeystoreParams,
} from "./keystoreParams";

/** A keystore in the REAL nested shape (kdf/kdfparams under `crypto`). */
const nestedKeystore = (kdf: string, params: Record<string, number>) => ({
  version: 1,
  id: "3198bc9c-6672-5ab3-d995-4942343ae5b6",
  address: "Qb60e8dd61c5d32be8058bb8eb970870f07233155",
  crypto: {
    ciphertext: "deadbeef",
    cipherparams: { iv: "bfb43120ae00e9de110f8325" },
    cipher: "aes-256-gcm",
    kdf,
    kdfparams: { ...params, salt: "aa".repeat(32) },
  },
});

describe("shouldUpgradeKeystoreParams", () => {
  it("flags a real nested keystore with weak params", () => {
    expect(
      shouldUpgradeKeystoreParams(
        nestedKeystore("argon2id", { m: 4096, t: 2, p: 1, dklen: 32 }),
      ),
    ).toBe(true);
  });

  it("does not flag a real nested keystore at the recommended params", () => {
    expect(
      shouldUpgradeKeystoreParams(
        nestedKeystore("argon2id", { ...RECOMMENDED_KEYSTORE_KDF_PARAMS }),
      ),
    ).toBe(false);
  });

  it("flags a nested keystore with a non-argon2id kdf", () => {
    expect(
      shouldUpgradeKeystoreParams(
        nestedKeystore("scrypt", { n: 8192, r: 8, p: 1, dklen: 32 }),
      ),
    ).toBe(true);
  });

  it("flags weak t and dklen individually", () => {
    expect(
      shouldUpgradeKeystoreParams(
        nestedKeystore("argon2id", { m: 262144, t: 2, p: 1, dklen: 32 }),
      ),
    ).toBe(true);
    expect(
      shouldUpgradeKeystoreParams(
        nestedKeystore("argon2id", { m: 262144, t: 8, p: 1, dklen: 16 }),
      ),
    ).toBe(true);
  });

  it("still evaluates a flat (non-nested) shape", () => {
    expect(
      shouldUpgradeKeystoreParams({
        kdf: "argon2id",
        kdfparams: { m: 4096, t: 2, p: 1, dklen: 32 },
      }),
    ).toBe(true);
    expect(
      shouldUpgradeKeystoreParams({
        kdf: "argon2id",
        kdfparams: { ...RECOMMENDED_KEYSTORE_KDF_PARAMS },
      }),
    ).toBe(false);
  });

  it("returns false for non-keystore inputs", () => {
    expect(shouldUpgradeKeystoreParams(null)).toBe(false);
    expect(shouldUpgradeKeystoreParams(undefined)).toBe(false);
    expect(shouldUpgradeKeystoreParams("keystore")).toBe(false);
    expect(shouldUpgradeKeystoreParams({})).toBe(false);
  });
});
