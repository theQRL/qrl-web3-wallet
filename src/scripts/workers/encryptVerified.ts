import type { KeyStore } from "@theqrl/web3";
import { decrypt, encrypt } from "@theqrl/web3-qrl-accounts";

/**
 * Encrypts an account's seed again and reads the result back before anyone
 * saves it. The new keystore replaces the only stored copy of the seed, so it
 * has to open with the same password to the same seed and address.
 */
export const encryptVerified = async (
  account: { address: string; seed: string },
  password: string,
): Promise<KeyStore> => {
  const keystore = await encrypt(account.seed, password);
  const readBack = await decrypt(keystore, password);
  if (readBack.seed !== account.seed || readBack.address !== account.address) {
    throw new Error("The rewritten keystore does not read back to the account");
  }
  return keystore;
};
