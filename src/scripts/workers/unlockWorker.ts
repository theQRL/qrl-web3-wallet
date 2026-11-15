/**
 * Web Worker that performs the CPU-heavy keystore decryption (argon2id).
 *
 * Running in a dedicated worker thread keeps the popup UI fully responsive
 * while the decryption is in progress AND avoids Chrome's MV3 service-worker
 * lifecycle issues (Chrome can't kill a worker that runs inside the popup).
 *
 * The popup fans the keystores out over several of these workers via
 * keystoreWorkerPool, so each instance receives a contiguous chunk of the
 * full keystore list and returns results aligned with its chunk order.
 * The KDF itself runs via hash-wasm (see src/crypto/keystoreCrypto.ts).
 */

import { decryptKeystore, encryptKeystore } from "@/crypto/keystoreCrypto";
import { getMnemonicFromHexSeed } from "@/functions/getMnemonicFromHexSeed";
import { shouldUpgradeKeystoreParams } from "@/scripts/lockManager/keystoreParams";
import type { KeyStore } from "@theqrl/web3";

export type UnlockWorkerRequest = {
  keystores: KeyStore[];
  password: string;
};

export type DecryptedKey = {
  address: string;
  seed: string;
  mnemonicPhrases: string;
};

export type UnlockWorkerResponse =
  | {
      success: true;
      /** Aligned with the request's keystore order. */
      keys: DecryptedKey[];
      /**
       * Aligned with the request's keystore order; a non-null entry is that
       * keystore re-encrypted with stronger KDF parameters. The popup-side
       * persists these in place of the old keystores so the user does not
       * need to take any explicit action.
       */
      upgraded: (KeyStore | null)[];
    }
  | {
      success: false;
      /**
       * true when the AES-GCM auth tag rejected (wrong password); false for
       * infrastructure failures (e.g. the WASM memory allocation failed), so
       * the popup can retry or surface a distinct error instead of telling
       * the user their correct password is wrong.
       */
      wrongPassword: boolean;
    };

/** WebCrypto surfaces a failed GCM auth-tag check as an OperationError. */
const isWrongPasswordError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "OperationError";

self.onmessage = async (event: MessageEvent<UnlockWorkerRequest>) => {
  const { keystores, password } = event.data;
  // Normalise to NFC so the same visual password yields the same bytes
  // regardless of the platform / IME the user typed it on.
  const normalisedPassword = password.normalize("NFC");
  try {
    const keys: DecryptedKey[] = [];
    const upgraded: (KeyStore | null)[] = [];
    for (const keyStore of keystores) {
      const { address, seed } = await decryptKeystore(
        keyStore,
        normalisedPassword,
      );
      keys.push({
        address,
        seed,
        mnemonicPhrases: getMnemonicFromHexSeed(seed),
      });
      upgraded.push(
        shouldUpgradeKeystoreParams(keyStore)
          ? await encryptKeystore(seed, normalisedPassword)
          : null,
      );
    }
    self.postMessage({
      success: true,
      keys,
      upgraded,
    } satisfies UnlockWorkerResponse);
  } catch (error) {
    self.postMessage({
      success: false,
      wrongPassword: isWrongPasswordError(error),
    } satisfies UnlockWorkerResponse);
  }
};
