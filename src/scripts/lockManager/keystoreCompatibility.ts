import {
  decrypt as decryptAes,
  encrypt as encryptAes,
} from "@theqrl/qrl-cryptography/aes.js";
import { argon2id } from "@theqrl/qrl-cryptography/argon2id.js";
import { shake256 } from "@theqrl/qrl-cryptography/keccak.js";
import { newWalletFromExtendedSeed } from "@theqrl/wallet.js";
import type { KeyStore } from "@theqrl/web3";
import { encrypt, seedToAccount } from "@theqrl/web3-qrl-accounts";
import { bytesToHex, hexToBytes, utf8ToHex } from "@theqrl/web3-utils";
import AddressUtil from "@/utilities/addressUtil";
import { RECOMMENDED_KEYSTORE_KDF_PARAMS } from "./keystoreParams";

type DecryptedKeystore = {
  address: string;
  seed: string;
  recoveryOnly?: boolean;
};

/**
 * The form of a password every writer and the session use: NFC, without
 * leading or trailing NUL characters (what utf8ToHex has always produced).
 * Readers also try the raw bytes, for vaults written without this form.
 */
export function normalizePassword(password: string) {
  return password.normalize("NFC").replace(/^\u0000+|\u0000+$/g, "");
}

function checkStoredAddress(storedAddress: string, derivedAddress: string) {
  // wallet.js 2 used the first 20 bytes of the same SHAKE256 address hash.
  const expected = AddressUtil.isLegacyQrlAddress(storedAddress)
    ? derivedAddress.slice(0, 41)
    : derivedAddress;
  if (storedAddress.toLowerCase() !== expected.toLowerCase()) {
    throw new Error("Keystore address does not match its seed");
  }
}

function accountFromSeed(
  seed: Uint8Array,
  storedAddress: string,
): DecryptedKeystore {
  let account: ReturnType<typeof seedToAccount>;
  try {
    account = seedToAccount(seed);
  } catch (error) {
    if (
      seed.length !== 51 ||
      seed[0] !== 1 ||
      (seed[1] === 0 && seed[2] === 0)
    ) {
      throw error;
    }
    const canonicalSeed = seed.slice();
    canonicalSeed.set([1, 0, 0]);
    let wallet: ReturnType<typeof newWalletFromExtendedSeed> | undefined;
    try {
      wallet = newWalletFromExtendedSeed(canonicalSeed);
      const publicKey = wallet.getPK();
      const input = new Uint8Array(3 + publicKey.length);
      input.set(seed.subarray(0, 3));
      input.set(publicKey, 3);
      const address = `Q${bytesToHex(shake256(input, { dkLen: 20 })).slice(2)}`;
      checkStoredAddress(storedAddress, address);
    } finally {
      canonicalSeed.fill(0);
      wallet?.zeroize();
    }
    return {
      address: storedAddress,
      seed: bytesToHex(seed),
      recoveryOnly: true,
    };
  }
  checkStoredAddress(storedAddress, account.address);
  return {
    address: AddressUtil.isLegacyQrlAddress(storedAddress)
      ? storedAddress
      : account.address,
    seed: account.seed,
  };
}

/** Read version 1 vaults while preserving legacy account identities for recovery. */
export async function decryptKeystore(keystore: KeyStore, password: string) {
  const params = keystore.crypto.kdfparams;
  if (
    keystore.version !== 1 ||
    keystore.crypto.cipher !== "aes-256-gcm" ||
    keystore.crypto.kdf !== "argon2id" ||
    !("m" in params)
  ) {
    throw new Error("Unsupported keystore format");
  }
  // Preserve the bounds accepted by web3 0.5.0 for existing encrypted seeds.
  const bounds = [
    [params.m, 4096, 1048576],
    [params.t, 2, 50],
    [params.p, 1, 16],
    [params.dklen, 16, 64],
  ];
  if (
    bounds.some(
      ([value, min, max]) =>
        !Number.isInteger(value) || value < min || value > max,
    )
  ) {
    throw new Error("Invalid keystore KDF parameters");
  }
  const salt =
    typeof params.salt === "string" ? hexToBytes(params.salt) : params.salt;
  // utf8ToHex drops leading and trailing NUL characters, which is what the
  // web3 1.x encrypt did. @theqrl/web3 2.0.0 encrypt keeps every byte, so a
  // password with NUL edges needs the raw UTF-8 bytes as a second candidate.
  const passwordCandidates = [hexToBytes(utf8ToHex(password))];
  const rawPassword = new TextEncoder().encode(password);
  if (bytesToHex(rawPassword) !== bytesToHex(passwordCandidates[0])) {
    passwordCandidates.push(rawPassword);
  }
  let lastError: unknown;
  for (const passwordBytes of passwordCandidates) {
    const key = await argon2id(
      passwordBytes,
      salt,
      params.t,
      params.m,
      params.p,
      params.dklen,
    );
    let seedBytes: Uint8Array | undefined;
    try {
      seedBytes = await decryptAes(
        hexToBytes(keystore.crypto.ciphertext),
        key,
        hexToBytes(keystore.crypto.cipherparams.iv),
      );
    } catch (error) {
      lastError = error;
      continue;
    } finally {
      key.fill(0);
    }
    try {
      return accountFromSeed(seedBytes, keystore.address);
    } finally {
      seedBytes.fill(0);
    }
  }
  throw lastError;
}

export async function reencryptKeystore(
  keystore: KeyStore,
  seed: string,
  password: string,
): Promise<KeyStore> {
  const seedBytes = hexToBytes(seed);
  let key: Uint8Array | undefined;
  try {
    const account = accountFromSeed(seedBytes, keystore.address);
    if (!account.recoveryOnly) {
      const encrypted = await encrypt(seed, password);
      return { ...encrypted, address: keystore.address };
    }

    // Preserve authenticated seeds that the current wallet library cannot parse.
    const params = RECOMMENDED_KEYSTORE_KDF_PARAMS;
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    key = await argon2id(
      hexToBytes(utf8ToHex(password)),
      salt,
      params.t,
      params.m,
      params.p,
      params.dklen,
    );
    const ciphertext = await encryptAes(seedBytes, key, iv);
    return {
      ...keystore,
      crypto: {
        cipher: "aes-256-gcm",
        ciphertext: bytesToHex(ciphertext).slice(2),
        cipherparams: { iv: bytesToHex(iv).slice(2) },
        kdf: "argon2id",
        kdfparams: { ...params, salt: bytesToHex(salt).slice(2) },
      },
    };
  } finally {
    key?.fill(0);
    seedBytes.fill(0);
  }
}
