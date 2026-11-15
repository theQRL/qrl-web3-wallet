// @vitest-environment node
// (node, not jsdom: @theqrl/web3-validator rejects Uint8Arrays created in
// the jsdom realm, so the upstream encrypt/decrypt calls only work here)

/**
 * Byte-compatibility suite for the hash-wasm-backed keystore crypto.
 *
 * The whole point of src/crypto/keystoreCrypto.ts is that it is a drop-in
 * replacement for @theqrl/web3-qrl-accounts encrypt()/decrypt(): existing
 * keystores (written via the pure-JS @noble/hashes argon2id) must decrypt,
 * and keystores we write must decrypt with the upstream library. These
 * tests pin that equivalence with small-but-valid KDF parameters so the
 * suite stays fast (the production m=262144 would take seconds per case).
 */

import { describe, expect, it } from "vitest";
import {
  decrypt as upstreamDecrypt,
  encrypt as upstreamEncrypt,
} from "@theqrl/web3-qrl-accounts";
import { argon2id as nobleArgon2id } from "@theqrl/qrl-cryptography/argon2id.js";
import { argon2id as wasmArgon2id } from "hash-wasm";
import {
  decryptKeystore,
  encryptKeystore,
  validateKdfParams,
} from "./keystoreCrypto";

// Extended-seed vector from the @theqrl/web3-qrl-accounts docs.
const SEED_HEX =
  "0x010000cea755979937e2dc6137c0e51ba0d1eb2a44920cefffb1a860cf194ea7d23d694045fd2c8a72ec5aecf1e7e5bb591ff2";
const PASSWORD = "correct horse battery staple";
// Smallest parameters the shared kdf_policy bounds allow.
const FAST_KDF = { m: 4096, t: 2, p: 1, dklen: 32 };
const FIXED_SALT =
  "210d0ec956787d865358ac45716e6dd42e68d48e346d795746509523aeb477dd";
const FIXED_IV = "bfb43120ae00e9de110f8325";

const SLOW_TEST_TIMEOUT = 30000;

describe("keystoreCrypto", () => {
  it(
    "round-trips its own keystores",
    async () => {
      const keystore = await encryptKeystore(SEED_HEX, PASSWORD, FAST_KDF);
      expect(keystore.version).toBe(1);
      expect(keystore.crypto.kdf).toBe("argon2id");
      expect(keystore.address).toMatch(/^Q[0-9a-f]{40}$/);

      const { address, seed } = await decryptKeystore(keystore, PASSWORD);
      expect(seed).toBe(SEED_HEX);
      expect(address.toLowerCase()).toBe(keystore.address.toLowerCase());
    },
    SLOW_TEST_TIMEOUT,
  );

  it(
    "decrypts keystores written by the upstream pure-JS implementation",
    async () => {
      const upstreamKeystore = await upstreamEncrypt(SEED_HEX, PASSWORD, {
        salt: FIXED_SALT,
        iv: FIXED_IV,
        ...FAST_KDF,
      });

      const { seed } = await decryptKeystore(upstreamKeystore, PASSWORD);
      expect(seed).toBe(SEED_HEX);
    },
    SLOW_TEST_TIMEOUT,
  );

  it(
    "writes keystores the upstream implementation can decrypt",
    async () => {
      const keystore = await encryptKeystore(SEED_HEX, PASSWORD, FAST_KDF);

      const account = await upstreamDecrypt(keystore, PASSWORD);
      expect(account.seed).toBe(SEED_HEX);
    },
    SLOW_TEST_TIMEOUT,
  );

  it(
    "produces a byte-identical crypto envelope for fixed salt/iv/params",
    async () => {
      const ours = await encryptKeystore(SEED_HEX, PASSWORD, {
        salt: FIXED_SALT,
        iv: FIXED_IV,
        ...FAST_KDF,
      });
      const theirs = await upstreamEncrypt(SEED_HEX, PASSWORD, {
        salt: FIXED_SALT,
        iv: FIXED_IV,
        ...FAST_KDF,
      });

      expect(ours.crypto).toEqual(theirs.crypto);
      expect(ours.address).toBe(theirs.address);
      expect(ours.version).toBe(theirs.version);
    },
    SLOW_TEST_TIMEOUT,
  );

  it(
    "rejects a wrong password via the GCM auth tag",
    async () => {
      const keystore = await encryptKeystore(SEED_HEX, PASSWORD, FAST_KDF);
      await expect(
        decryptKeystore(keystore, "not the password"),
      ).rejects.toThrow();
    },
    SLOW_TEST_TIMEOUT,
  );

  it("rejects out-of-bounds kdf parameters", () => {
    expect(() =>
      validateKdfParams({ m: 2048, t: 2, p: 1, dklen: 32 }),
    ).toThrow();
    expect(() =>
      validateKdfParams({ m: 4096, t: 1, p: 1, dklen: 32 }),
    ).toThrow();
    expect(() =>
      validateKdfParams({ m: 4096, t: 2, p: 0, dklen: 32 }),
    ).toThrow();
    expect(() =>
      validateKdfParams({ m: 4096, t: 2, p: 1, dklen: 8 }),
    ).toThrow();
    expect(() =>
      validateKdfParams({ m: 4096, t: 2, p: 1, dklen: 32 }),
    ).not.toThrow();
  });

  it(
    "hash-wasm and @noble argon2id stay byte-identical (dependency drift guard)",
    async () => {
      const encoder = new TextEncoder();
      const vectors = [
        { password: PASSWORD, salt: FIXED_SALT },
        // Unicode password, NFC-normalised the way every caller does it.
        { password: "pässwörd-café-🔑".normalize("NFC"), salt: FIXED_SALT },
      ];
      for (const vector of vectors) {
        const passwordBytes = encoder.encode(vector.password);
        const saltBytes = new Uint8Array(
          vector.salt.match(/.{2}/g)?.map((b) => parseInt(b, 16)) ?? [],
        );
        const wasm = await wasmArgon2id({
          password: passwordBytes,
          salt: saltBytes,
          iterations: FAST_KDF.t,
          memorySize: FAST_KDF.m,
          parallelism: FAST_KDF.p,
          hashLength: FAST_KDF.dklen,
          outputType: "binary",
        });
        const noble = await nobleArgon2id(
          passwordBytes,
          saltBytes,
          FAST_KDF.t,
          FAST_KDF.m,
          FAST_KDF.p,
          FAST_KDF.dklen,
        );
        expect(Buffer.from(wasm).toString("hex")).toBe(
          Buffer.from(noble).toString("hex"),
        );
      }
    },
    SLOW_TEST_TIMEOUT,
  );

  it(
    "encodes the password exactly like upstream for leading/trailing U+0000",
    async () => {
      // @theqrl/web3-qrl-accounts encrypt()/decrypt() turn the password into
      // bytes via hexToBytes(utf8ToHex(password)); utf8ToHex trims one leading
      // and one trailing NUL. A raw TextEncoder pass would not, deriving a
      // different key, so a keystore written on one side would fail to decrypt
      // on the other for a NUL-padded password.
      const paddedPassword = `\u0000${PASSWORD}\u0000`;

      // Upstream writes with the padded password; we must decrypt it.
      const upstreamKeystore = await upstreamEncrypt(SEED_HEX, paddedPassword, {
        salt: FIXED_SALT,
        iv: FIXED_IV,
        ...FAST_KDF,
      });
      const fromUpstream = await decryptKeystore(
        upstreamKeystore,
        paddedPassword,
      );
      expect(fromUpstream.seed).toBe(SEED_HEX);

      // We write with the padded password; upstream must decrypt it, and so
      // must the trimmed form of the same password (utf8ToHex makes them equal).
      const ourKeystore = await encryptKeystore(
        SEED_HEX,
        paddedPassword,
        FAST_KDF,
      );
      expect((await upstreamDecrypt(ourKeystore, paddedPassword)).seed).toBe(
        SEED_HEX,
      );
      expect((await decryptKeystore(ourKeystore, PASSWORD)).seed).toBe(
        SEED_HEX,
      );
    },
    SLOW_TEST_TIMEOUT,
  );
});
