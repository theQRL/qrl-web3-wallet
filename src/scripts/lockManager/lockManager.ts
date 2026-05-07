import StorageUtil, { LockState } from "@/utilities/storageUtil";
import { Bytes } from "@theqrl/web3";
import { decrypt, encrypt } from "@theqrl/web3-qrl-accounts";
import { getMnemonicFromHexSeed } from "@/functions/getMnemonicFromHexSeed";
import browser from "webextension-polyfill";

type MessageType = {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
};

export type EncryptAccountType = {
  seed: Bytes;
  password: string;
};

export type DecryptedKeyType = {
  address: string;
  mnemonicPhrases: string;
};

// SET_DECRYPTED_KEYS payload: keys are stored alongside the wallet password
// so the SW can re-encrypt new accounts during the unlock session, but the
// password is held in a separate field (not interleaved with each key) and
// is excluded from the session-storage backup.
export type SetDecryptedKeysPayload = {
  keys: DecryptedKeyType[];
  walletPassword: string;
};

export const LOCK_MANAGER_MESSAGES = {
  PORT: "LOCK_MANGER_PORT",
  IS_LOCK_MANAGER_READY: "IS_LOCK_MANAGER_READY",
  IS_LOCKED: "LOCK_MANAGER_IS_LOCKED",
  ENCRYPT_ACCOUNT: "ENCRYPT_ACCOUNT",
  LOCK: "LOCK_MANAGER_LOCK",
  UNLOCK: "LOCK_MANAGER_UNLOCK",
  LOCK_MANAGER_KEEP_LIVE: "LOCK_MANAGER_KEEP_LIVE",
  GET_DECRYPTED_KEYS: "GET_DECRYPTED_KEYS",
  GET_WALLET_PASSWORD: "GET_WALLET_PASSWORD",
  SET_DECRYPTED_KEYS: "SET_DECRYPTED_KEYS",
  UPDATE_AUTO_LOCK: "LOCK_MANAGER_UPDATE_AUTO_LOCK",
  SEND_TX_NOTIFICATION: "SEND_TX_NOTIFICATION",
} as const;

/**
 * The lock manager, which is part of the extension service worker handles lock related data and functions.
 *
 * IMPORTANT: CPU-heavy cryptographic operations (decrypt / encrypt via scrypt)
 * are performed in the popup, NOT in the service worker.  The popup sends the
 * resulting keys to the SW via the SET_DECRYPTED_KEYS message so that the SW
 * only stores them in memory.  This avoids Chrome killing the SW mid-decrypt.
 */
class LockManager {
  private static decryptedKeys?: DecryptedKeyType[];
  // Held in memory only — never written to session storage. Separating the
  // password from `decryptedKeys` reduces blast radius if either store leaks.
  private static walletPassword?: string;
  static readonly AUTO_LOCK_ALARM = "QRL_AUTO_LOCK";
  static readonly KEEP_ALIVE_ALARM = "QRL_KEEP_ALIVE";
  private static readonly SESSION_KEYS_KEY = "_LM_CACHED_KEYS";

  static async lock() {
    this.clearDecryptedKeys();
    this.walletPassword = undefined;
    await this.clearSessionKeys();
    await this.stopKeepAlive();
    await this.clearAutoLockAlarm();
  }

  static async startKeepAlive() {
    await browser.alarms.create(this.KEEP_ALIVE_ALARM, {
      periodInMinutes: 0.4, // ~24 seconds — under Chrome's 30s kill threshold
    });
  }

  static async stopKeepAlive() {
    await browser.alarms.clear(this.KEEP_ALIVE_ALARM);
  }

  /**
   * Called when the keep-alive alarm fires.
   * Writes to session storage to reset Chrome's inactivity timer.
   * Also restores keys from session backup if SW was restarted.
   */
  static async handleKeepAliveAlarm() {
    // Restore keys from session backup if SW restarted (lost in-memory keys)
    if (this.decryptedKeys === undefined) {
      await this.restoreKeysFromSession();
    }
    // Write to session storage to keep the SW alive
    await browser.storage.session.set({ keepAlive: Date.now() });
  }

  static async setupAutoLockAlarm() {
    const settings = await StorageUtil.getSettings();
    const minutes = settings.autoLockMinutes ?? 15;
    if (minutes > 0) {
      await browser.alarms.create(this.AUTO_LOCK_ALARM, {
        delayInMinutes: minutes,
      });
    } else {
      await this.clearAutoLockAlarm();
    }
  }

  static async clearAutoLockAlarm() {
    await browser.alarms.clear(this.AUTO_LOCK_ALARM);
  }

  static async handleAutoLockAlarm() {
    await this.lock();
    await StorageUtil.updateLockStateTimeStamp(LockState.LOCKED);
  }

  /**
   * Backup decrypted keys to session storage.
   * Session storage survives SW restarts but clears on browser close.
   */
  private static async backupKeysToSession() {
    if (this.decryptedKeys) {
      await browser.storage.session.set({
        [this.SESSION_KEYS_KEY]: this.decryptedKeys,
      });
    }
  }

  private static async clearSessionKeys() {
    await browser.storage.session.remove(this.SESSION_KEYS_KEY);
  }

  /**
   * Restore keys from session storage after SW restart.
   * Returns true if keys were restored.
   */
  static async restoreKeysFromSession(): Promise<boolean> {
    try {
      const data = await browser.storage.session.get(this.SESSION_KEYS_KEY);
      const keys = data?.[this.SESSION_KEYS_KEY] as
        | DecryptedKeyType[]
        | undefined;
      if (keys?.length) {
        this.decryptedKeys = keys;
        return true;
      }
    } catch {
      // Session storage read failed — accept locked state
    }
    return false;
  }

  /**
   * Decrypt all keystores with the given password.
   * Called via a dedicated port connection so there is no message-channel
   * timeout — the port stays open as long as needed.
   * Returns true on success, false on wrong password or empty keystores.
   */
  static async unlock(password: string): Promise<boolean> {
    try {
      // Normalise to NFC so the same visual password yields the same bytes
      // regardless of the platform / IME the user typed it on.
      const normalisedPassword = password.normalize("NFC");
      const keyStores = await StorageUtil.getKeystores();
      if (!keyStores.length) return false;
      const decryptedKeys: DecryptedKeyType[] = [];
      for (const keyStore of keyStores) {
        // Yield the event loop between decryptions so Chrome
        // doesn't consider the service worker unresponsive.
        await new Promise((r) => setTimeout(r, 0));
        const { address, seed } = await decrypt(keyStore, normalisedPassword);
        decryptedKeys.push({
          address,
          mnemonicPhrases: getMnemonicFromHexSeed(seed),
        });
      }
      this.walletPassword = normalisedPassword;
      this.setDecryptedKeys(
        Array.from(
          new Map(
            decryptedKeys.map((item) => [item.address.toLowerCase(), item]),
          ).values(),
        ),
      );
      return true;
    } catch {
      this.clearDecryptedKeys();
      this.walletPassword = undefined;
      return false;
    }
  }

  static async isLocked() {
    const keyStores = await StorageUtil.getKeystores();
    const accounts = await StorageUtil.getAllAccounts();
    const hasPasswordSet = keyStores.length > 0 && accounts.length > 0;
    if (!hasPasswordSet) {
      // Storage looks like a first-run / partial-reset state. Drop any
      // in-memory keys but do NOT wipe persistent storage from a query
      // path — the popup's onboarding flow will guide the user. An
      // explicit factory-reset action lives in settings for intentional
      // wipes.
      this.clearDecryptedKeys();
      this.walletPassword = undefined;
    }
    // If SW restarted (lost in-memory keys), try restoring from session backup.
    if (this.decryptedKeys === undefined && hasPasswordSet) {
      await this.restoreKeysFromSession();
    }
    return {
      isLocked: this.decryptedKeys === undefined,
      hasPasswordSet,
    };
  }

  /**
   * Accept pre-decrypted keys from the popup.
   * The popup performs the CPU-heavy decrypt, then sends the results here.
   * Accepts either the new {keys, walletPassword} payload or a bare keys
   * array (the latter for SW-restart re-sends, where the popup may have
   * lost the password but still has cached keys).
   */
  static setDecryptedKeysFromPopup(
    payload: SetDecryptedKeysPayload | DecryptedKeyType[],
  ) {
    const keys = Array.isArray(payload) ? payload : payload.keys;
    if (!Array.isArray(payload) && payload.walletPassword) {
      this.walletPassword = payload.walletPassword;
    }
    this.setDecryptedKeys(
      Array.from(
        new Map(
          keys.map((item) => [item.address.toLowerCase(), item]),
        ).values(),
      ),
    );
  }

  static async encryptAccount(accountData: EncryptAccountType) {
    const { password: rawPassword, seed } = accountData;
    const password = rawPassword.normalize("NFC");
    const keystores = await StorageUtil.getKeystores();
    const encryptedKeyStore = await encrypt(seed, password);
    const updatedKeyStores = [...keystores, encryptedKeyStore];
    await StorageUtil.setKeystores(
      Array.from(
        new Map(
          updatedKeyStores.map((item) => [item.address.toLowerCase(), item]),
        ).values(),
      ),
    );
    // Add the new account key directly to in-memory keys
    // instead of re-decrypting everything (which would block the SW).
    const newKey: DecryptedKeyType = {
      address: encryptedKeyStore.address,
      mnemonicPhrases: getMnemonicFromHexSeed(seed as string),
    };
    this.walletPassword = password;
    const existingKeys = this.decryptedKeys ?? [];
    this.setDecryptedKeys(
      Array.from(
        new Map(
          [...existingKeys, newKey].map((item) => [
            item.address.toLowerCase(),
            item,
          ]),
        ).values(),
      ),
    );
  }

  private static setDecryptedKeys(decryptedKeys: DecryptedKeyType[]) {
    this.decryptedKeys = decryptedKeys;
    this.backupKeysToSession();
  }

  static getWalletPassword() {
    // Force the locked-state error if keys are gone.
    this.getDecryptedKeys();
    return this.walletPassword ?? "";
  }

  static getDecryptedKeys() {
    if (!this.decryptedKeys) {
      this.clearDecryptedKeys();
      throw new Error("QRL Web3 Wallet is locked");
    }
    return this.decryptedKeys;
  }

  private static clearDecryptedKeys() {
    this.decryptedKeys = undefined;
  }

  static async lockManagerListener(
    message: MessageType,
    sender?: browser.Runtime.MessageSender,
  ) {
    // Reject any same-extension caller that is not an extension page (popup,
    // options, side panel). Content scripts are part of the same extension
    // but run with `sender.url === <page-url>`; the only legitimate callers
    // for these messages are extension pages, whose `sender.url` starts with
    // the extension's own origin. Defence in depth: today no content script
    // sends LOCK_MANAGER messages, but a future code-path that forwards
    // arbitrary messages should not be able to read decrypted keys.
    if (sender !== undefined) {
      const extensionUrlPrefix = browser.runtime.getURL("");
      if (
        typeof sender.url === "string" &&
        !sender.url.startsWith(extensionUrlPrefix)
      ) {
        return undefined;
      }
    }
    let result;
    if (message.name === LOCK_MANAGER_MESSAGES.IS_LOCKED) {
      result = await LockManager.isLocked();
    } else if (message.name === LOCK_MANAGER_MESSAGES.SET_DECRYPTED_KEYS) {
      // The popup decrypted the keystores locally and is sending us the results.
      LockManager.setDecryptedKeysFromPopup(message?.data ?? []);
      await LockManager.startKeepAlive();
      await LockManager.setupAutoLockAlarm();
      result = { success: true };
    } else if (message.name === LOCK_MANAGER_MESSAGES.LOCK) {
      result = await LockManager.lock();
    } else if (message.name === LOCK_MANAGER_MESSAGES.UPDATE_AUTO_LOCK) {
      await LockManager.setupAutoLockAlarm();
      result = { success: true };
    } else if (message.name === LOCK_MANAGER_MESSAGES.GET_DECRYPTED_KEYS) {
      result = LockManager.getDecryptedKeys();
    } else if (message.name === LOCK_MANAGER_MESSAGES.GET_WALLET_PASSWORD) {
      result = LockManager.getWalletPassword();
    } else if (message.name === LOCK_MANAGER_MESSAGES.ENCRYPT_ACCOUNT) {
      result = await LockManager.encryptAccount(message?.data ?? {});
    }

    // Any message while wallet is unlocked resets the auto-lock timer.
    if (LockManager.decryptedKeys !== undefined) {
      await LockManager.setupAutoLockAlarm();
    }

    return result;
  }
}

export default LockManager;
