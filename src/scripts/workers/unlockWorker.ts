/**
 * Web Worker that performs the CPU-heavy keystore decryption (scrypt / argon2id).
 *
 * Running in a dedicated worker thread keeps the popup UI fully responsive
 * while the decryption is in progress AND avoids Chrome's MV3 service-worker
 * lifecycle issues (Chrome can't kill a worker that runs inside the popup).
 */

import { decrypt, encrypt } from "@theqrl/web3-qrl-accounts";
import { getMnemonicFromHexSeed } from "@/functions/getMnemonicFromHexSeed";
import {
  RECOMMENDED_KEYSTORE_KDF_PARAMS,
  shouldUpgradeKeystoreParams,
} from "@/scripts/lockManager/keystoreParams";
import type { KeyStore } from "@theqrl/web3";

export type UnlockWorkerRequest = {
  keystores: KeyStore[];
  password: string;
};

export type DecryptedKey = {
  address: string;
  mnemonicPhrases: string;
};

export type UnlockWorkerResponse =
  | {
      success: true;
      keys: DecryptedKey[];
      // Populated when one or more keystores were re-encrypted with stronger
      // KDF parameters. The popup-side persists these in place of the old
      // keystores so the user does not need to take any explicit action.
      upgradedKeystores?: KeyStore[];
    }
  | { success: false };

self.onmessage = async (event: MessageEvent<UnlockWorkerRequest>) => {
  const { keystores, password } = event.data;
  // Normalise to NFC so the same visual password yields the same bytes
  // regardless of the platform / IME the user typed it on.
  const normalisedPassword = password.normalize("NFC");
  try {
    const keys: DecryptedKey[] = [];
    let upgradedKeystores: KeyStore[] | undefined;
    for (const keyStore of keystores) {
      const { address, seed } = await decrypt(keyStore, normalisedPassword);
      keys.push({
        address,
        mnemonicPhrases: getMnemonicFromHexSeed(seed),
      });
      if (shouldUpgradeKeystoreParams(keyStore)) {
        if (!upgradedKeystores) {
          upgradedKeystores = [...keystores];
        }
        const reEncrypted = await encrypt(seed, normalisedPassword);
        const idx = upgradedKeystores.findIndex(
          (k) => k.address?.toLowerCase() === keyStore.address?.toLowerCase(),
        );
        if (idx >= 0) upgradedKeystores[idx] = reEncrypted;
      }
    }
    // Reference the constant so tree-shaking does not drop the import.
    void RECOMMENDED_KEYSTORE_KDF_PARAMS;
    self.postMessage({
      success: true,
      keys,
      upgradedKeystores,
    } satisfies UnlockWorkerResponse);
  } catch {
    // decrypt() throws when the password is wrong
    self.postMessage({ success: false } satisfies UnlockWorkerResponse);
  }
};
