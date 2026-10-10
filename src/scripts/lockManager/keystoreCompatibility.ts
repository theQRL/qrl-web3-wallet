import { decrypt as decryptAes } from "@theqrl/qrl-cryptography/aes.js";
import { argon2id } from "@theqrl/qrl-cryptography/argon2id.js";
import type { KeyStore } from "@theqrl/web3";
import { decrypt, encrypt, seedToAccount } from "@theqrl/web3-qrl-accounts";
import { hexToBytes } from "@theqrl/web3-utils";
import AddressUtil from "@/utilities/addressUtil";

function checkStoredAddress(storedAddress: string, derivedAddress: string) {
  // wallet.js 2 used the first 20 bytes of the same SHAKE256 address hash.
  const expected = AddressUtil.isLegacyQrlAddress(storedAddress)
    ? derivedAddress.slice(0, 41)
    : derivedAddress;
  if (storedAddress.toLowerCase() !== expected.toLowerCase()) {
    throw new Error("Keystore address does not match its seed");
  }
}

/** Read version 1 vaults while preserving legacy account identities for recovery. */
export async function decryptKeystore(keystore: KeyStore, password: string) {
  const params = keystore.crypto.kdfparams;
  const legacyAddress = AddressUtil.isLegacyQrlAddress(keystore.address);
  if (!legacyAddress && "m" in params && params.m >= 19456) {
    return decrypt(keystore, password);
  }

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
  const key = await argon2id(
    new TextEncoder().encode(password),
    typeof params.salt === "string" ? hexToBytes(params.salt) : params.salt,
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
    const account = seedToAccount(seedBytes);
    checkStoredAddress(keystore.address, account.address);
    return {
      address: legacyAddress ? keystore.address : account.address,
      seed: account.seed,
    };
  } finally {
    key.fill(0);
    seedBytes?.fill(0);
  }
}

export async function reencryptKeystore(
  keystore: KeyStore,
  seed: string,
  password: string,
) {
  const encrypted = await encrypt(seed, password);
  checkStoredAddress(keystore.address, encrypted.address);
  return { ...encrypted, address: keystore.address };
}
