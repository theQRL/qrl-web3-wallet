/**
 * Keystore encrypt/decrypt with the argon2id KDF executed via hash-wasm
 * (WebAssembly) instead of the pure-JS @noble/hashes implementation that
 * @theqrl/web3-qrl-accounts uses internally.
 *
 * At the production KDF parameters (m=262144 KiB, t=8, p=1) the pure-JS
 * derivation takes ~20 s per keystore; the WASM one takes ~2 s and produces
 * byte-identical output (pinned by the cross-implementation vectors in
 * keystoreCrypto.test.ts). The keystore JSON format, parameters, and
 * AES-256-GCM layer are unchanged from @theqrl/web3-qrl-accounts, so
 * keystores written by either implementation stay mutually compatible.
 *
 * Format contract (mirrors account.js in @theqrl/web3-qrl-accounts):
 * - version: 1, id: UUID v4, address: "Q" + 40 lowercase hex chars
 * - crypto.ciphertext: hex (no 0x) of AES-256-GCM output incl. the 16-byte
 *   auth tag; the tag is the sole integrity/wrong-password check (no MAC)
 * - crypto.cipherparams.iv: hex (no 0x), exactly 12 bytes
 * - crypto.kdfparams.salt: hex (no 0x); the password is turned into bytes
 *   exactly as @theqrl/web3-qrl-accounts does it, via utf8ToHex (which trims
 *   one leading and one trailing U+0000), so the derived key is byte-identical
 *   for every password (callers NFC-normalise first, matching existing flows)
 */

import { argon2id as argon2idWasm } from "hash-wasm";
import { argon2id as argon2idJs } from "@theqrl/qrl-cryptography/argon2id.js";
import { parseAndValidateSeed, seedToAccount } from "@theqrl/web3-qrl-accounts";
import { utf8ToHex } from "@theqrl/web3-utils";
import type { Bytes, KeyStore } from "@theqrl/web3";
import { RECOMMENDED_KEYSTORE_KDF_PARAMS } from "@/scripts/lockManager/keystoreParams";

export type DecryptedKeystore = {
  /** Checksummed Q-address, as returned by seedToAccount. */
  address: string;
  /** 0x-prefixed hex extended seed, as returned by seedToAccount. */
  seed: string;
};

export type KeystoreKdfParams = {
  m: number;
  t: number;
  p: number;
  dklen: number;
};

export type EncryptKeystoreOptions = Partial<KeystoreKdfParams> & {
  /** Fixed salt (32 bytes) for deterministic output in tests. */
  salt?: Uint8Array | string;
  /** Fixed IV (12 bytes) for deterministic output in tests. */
  iv?: Uint8Array | string;
};

// Parameter bounds mirrored from @theqrl/web3-qrl-accounts kdf_policy.js so
// both implementations accept and reject the same keystores.
const KDF_PARAM_BOUNDS: Record<keyof KeystoreKdfParams, [number, number]> = {
  m: [4096, 1048576],
  t: [2, 50],
  p: [1, 16],
  dklen: [16, 64],
};

const hexToBytes = (hex: string): Uint8Array<ArrayBuffer> => {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error("keystoreCrypto: invalid hex string");
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const toBytes = (value: Uint8Array | string): Uint8Array<ArrayBuffer> =>
  typeof value === "string" ? hexToBytes(value) : new Uint8Array(value);

export function validateKdfParams(params: KeystoreKdfParams): void {
  for (const key of Object.keys(KDF_PARAM_BOUNDS) as Array<
    keyof KeystoreKdfParams
  >) {
    const value = params[key];
    const [min, max] = KDF_PARAM_BOUNDS[key];
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(
        `keystoreCrypto: kdf parameter ${key}=${String(value)} outside [${String(min)}, ${String(max)}]`,
      );
    }
  }
}

/**
 * Derive the AES key with argon2id. hash-wasm computes byte-identical
 * output to the @noble/hashes implementation ~10x faster; if WASM is
 * unavailable (CSP without 'wasm-unsafe-eval', or the ~m KiB linear-memory
 * allocation fails under pressure) we fall back to the pure-JS
 * implementation the keystores were originally written with.
 */
async function deriveArgon2idKey(
  passwordBytes: Uint8Array,
  saltBytes: Uint8Array,
  params: KeystoreKdfParams,
): Promise<Uint8Array> {
  try {
    return await argon2idWasm({
      password: passwordBytes,
      salt: saltBytes,
      iterations: params.t,
      memorySize: params.m,
      parallelism: params.p,
      hashLength: params.dklen,
      outputType: "binary",
    });
  } catch (error) {
    // Loud on purpose: if this fires on every unlock the CSP is missing
    // 'wasm-unsafe-eval' or hash-wasm regressed, and unlocks are silently
    // ~10x slower than they should be.
    console.warn(
      "keystoreCrypto: WASM argon2id unavailable, falling back to pure-JS",
      error,
    );
    return argon2idJs(
      passwordBytes,
      saltBytes,
      params.t,
      params.m,
      params.p,
      params.dklen,
    );
  }
}

async function importAesKey(
  keyBytes: Uint8Array,
  usage: KeyUsage,
): Promise<CryptoKey> {
  if (keyBytes.length !== 32) {
    throw new Error("keystoreCrypto: wrong AES key length");
  }
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(keyBytes),
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

const assertIvLength = (iv: Uint8Array): void => {
  if (iv.length !== 12) {
    throw new Error("keystoreCrypto: IV must be 12 bytes");
  }
};

/**
 * Decrypt a keystore. Throws on malformed keystores and on wrong password
 * (the AES-GCM auth-tag check rejects, same as the upstream decrypt()).
 */
export async function decryptKeystore(
  keystore: KeyStore,
  password: string,
): Promise<DecryptedKeystore> {
  if (keystore.version !== 1) {
    throw new Error("keystoreCrypto: unsupported keystore version");
  }
  if (keystore.crypto.cipher !== "aes-256-gcm") {
    throw new Error("keystoreCrypto: unsupported cipher");
  }
  if (keystore.crypto.kdf !== "argon2id") {
    throw new Error("keystoreCrypto: unsupported kdf");
  }
  const { kdfparams } = keystore.crypto;
  validateKdfParams(kdfparams);

  // Match @theqrl/web3-qrl-accounts encrypt()/decrypt() exactly: the password
  // becomes bytes via hexToBytes(utf8ToHex(password)), not a raw TextEncoder
  // pass, so passwords with leading/trailing U+0000 derive the same key here
  // as in the upstream library.
  const passwordBytes = hexToBytes(utf8ToHex(password));
  const saltBytes = toBytes(kdfparams.salt);
  const derivedKey = await deriveArgon2idKey(
    passwordBytes,
    saltBytes,
    kdfparams,
  );

  const iv = hexToBytes(keystore.crypto.cipherparams.iv);
  assertIvLength(iv);
  const aesKey = await importAesKey(derivedKey, "decrypt");
  const seedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    hexToBytes(keystore.crypto.ciphertext),
  );

  const account = seedToAccount(new Uint8Array(seedBuffer));
  return { address: account.address, seed: account.seed };
}

/**
 * Encrypt a seed into a keystore byte-compatible with the upstream
 * encrypt(): identical crypto envelope for identical salt/iv/params.
 */
export async function encryptKeystore(
  seed: Bytes,
  password: string,
  options?: EncryptKeystoreOptions,
): Promise<KeyStore> {
  if (!password) {
    throw new Error("keystoreCrypto: refusing to encrypt without a password");
  }
  const seedBytes = parseAndValidateSeed(seed);

  const salt = options?.salt
    ? toBytes(options.salt)
    : crypto.getRandomValues(new Uint8Array(32));
  const iv = options?.iv
    ? toBytes(options.iv)
    : crypto.getRandomValues(new Uint8Array(12));
  assertIvLength(iv);

  const kdf: KeystoreKdfParams = {
    m: options?.m ?? RECOMMENDED_KEYSTORE_KDF_PARAMS.m,
    t: options?.t ?? RECOMMENDED_KEYSTORE_KDF_PARAMS.t,
    p: options?.p ?? RECOMMENDED_KEYSTORE_KDF_PARAMS.p,
    dklen: options?.dklen ?? RECOMMENDED_KEYSTORE_KDF_PARAMS.dklen,
  };
  validateKdfParams(kdf);

  // Match @theqrl/web3-qrl-accounts encrypt()/decrypt() exactly: the password
  // becomes bytes via hexToBytes(utf8ToHex(password)), not a raw TextEncoder
  // pass, so passwords with leading/trailing U+0000 derive the same key here
  // as in the upstream library.
  const passwordBytes = hexToBytes(utf8ToHex(password));
  const derivedKey = await deriveArgon2idKey(passwordBytes, salt, kdf);

  const aesKey = await importAesKey(derivedKey, "encrypt");
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new Uint8Array(seedBytes),
  );

  const account = seedToAccount(new Uint8Array(seedBytes));
  return {
    version: 1,
    id: crypto.randomUUID(),
    address: `Q${account.address.slice(1).toLowerCase()}`,
    crypto: {
      ciphertext: bytesToHex(new Uint8Array(cipherBuffer)),
      cipherparams: { iv: bytesToHex(iv) },
      cipher: "aes-256-gcm",
      kdf: "argon2id",
      kdfparams: { ...kdf, salt: bytesToHex(salt) },
    },
  };
}
