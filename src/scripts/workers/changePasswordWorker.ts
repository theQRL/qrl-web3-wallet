/**
 * Web Worker that re-encrypts keystores with a new password.
 *
 * 1. Decrypts each keystore with the old password (CPU-heavy argon2id,
 *    executed via hash-wasm, see src/crypto/keystoreCrypto.ts).
 * 2. Re-encrypts each seed with the new password.
 * 3. Returns the new keystores and decrypted key metadata, aligned with the
 *    request's keystore order.
 *
 * Runs in a dedicated thread so the popup UI stays responsive; the popup
 * fans keystores out over several instances via keystoreWorkerPool.
 */

import {
  decryptKeystore,
  encryptKeystore,
} from "@/crypto/keystoreCrypto";
import { getMnemonicFromHexSeed } from "@/functions/getMnemonicFromHexSeed";
import type { KeyStore } from "@theqrl/web3";

export type ChangePasswordWorkerRequest = {
  keystores: KeyStore[];
  oldPassword: string;
  newPassword: string;
};

export type DecryptedKey = {
  address: string;
  seed: string;
  mnemonicPhrases: string;
};

export type ChangePasswordWorkerResponse =
  | { success: true; newKeystores: KeyStore[]; newKeys: DecryptedKey[] }
  | {
      success: false;
      /**
       * true when the AES-GCM auth tag rejected (wrong old password); false
       * for infrastructure failures so the popup can retry sequentially
       * instead of blaming the password.
       */
      wrongPassword: boolean;
    };

/** WebCrypto surfaces a failed GCM auth-tag check as an OperationError. */
const isWrongPasswordError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "OperationError";

self.onmessage = async (
  event: MessageEvent<ChangePasswordWorkerRequest>,
) => {
  const { keystores, oldPassword, newPassword } = event.data;
  // Normalise both passwords to NFC so the same visual password yields the
  // same bytes regardless of the platform / IME the user typed it on.
  const normalisedOld = oldPassword.normalize("NFC");
  const normalisedNew = newPassword.normalize("NFC");
  try {
    const newKeystores: KeyStore[] = [];
    const newKeys: DecryptedKey[] = [];

    for (const keyStore of keystores) {
      const { address, seed } = await decryptKeystore(keyStore, normalisedOld);
      const reEncrypted = await encryptKeystore(seed, normalisedNew);
      newKeystores.push(reEncrypted);
      newKeys.push({
        address,
        seed,
        mnemonicPhrases: getMnemonicFromHexSeed(seed),
      });
    }

    self.postMessage({
      success: true,
      newKeystores,
      newKeys,
    } satisfies ChangePasswordWorkerResponse);
  } catch (error) {
    self.postMessage({
      success: false,
      wrongPassword: isWrongPasswordError(error),
    } satisfies ChangePasswordWorkerResponse);
  }
};
