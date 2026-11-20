import StorageUtil, { LockState } from "@/utilities/storageUtil";
import { Bytes } from "@theqrl/web3";
import { decrypt, encrypt } from "@theqrl/web3-qrl-accounts";
import { getMnemonicFromHexSeed } from "@/functions/getMnemonicFromHexSeed";
import { EXTENSION_MESSAGES } from "../constants/streamConstants";
import browser from "webextension-polyfill";

type MessageType = {
  name?: string;
  // A dApp approval/rejection response uses this `action` field as its
  // discriminator. See EXTENSION_MESSAGES.DAPP_RESPONSE in
  // dAppRequestStore.ts.
  action?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
};

// Session-storage keys that are automated background traffic: LockStore's
// own storage-change listener needs to recognise these so it can leave
// them out of what counts as user activity (see
// AUTO_LOCK_ACTIVITY_MESSAGE_NAMES below for the message-based half of the
// same guarantee).
export const SESSION_KEYS_STORAGE_KEY = "_LM_CACHED_KEYS";
export const KEEP_ALIVE_SESSION_KEY = "keepAlive";

export type EncryptAccountType = {
  seed: Bytes;
  password: string;
};

export type DecryptedKeyType = {
  address: string;
  seed: string;
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
  // An open window offers the keys it still holds to a worker that has
  // none, to carry an unlocked wallet over a restart of the worker. A
  // worker that has locked the wallet refuses them.
  RESTORE_DECRYPTED_KEYS: "RESTORE_DECRYPTED_KEYS",
  UPDATE_AUTO_LOCK: "LOCK_MANAGER_UPDATE_AUTO_LOCK",
  SEND_TX_NOTIFICATION: "SEND_TX_NOTIFICATION",
  RESET_OUTDATED_STORAGE: "RESET_OUTDATED_STORAGE",
  // A throttled ping the open surfaces send on pointer/keyboard/focus
  // activity, purely so the auto-lock timer can tell "the user is actively
  // using an open surface" apart from automated traffic (keep-alive ticks,
  // IS_LOCKED polling). Carries no data.
  USER_ACTIVITY: "LOCK_MANAGER_USER_ACTIVITY",
} as const;

// How the report of a lock whose cleanup failed begins; the popup tells it
// from a request that never arrived.
export const LOCK_CLEANUP_FAILED =
  "The wallet is locked, but a cleanup step failed";

export const OUTDATED_STORAGE_MESSAGE =
  "QRL Web3 Wallet needs a fresh wallet before it can be used. Open the extension to continue.";

// Message names that represent a deliberate user action or a user-initiated
// write, and therefore postpone the inactivity auto-lock. Everything else,
// reads (GET_*, IS_LOCKED) and automated background traffic, must not
// postpone it, or the wallet never locks while any surface is left open.
// See lockManagerListener() below for the dApp approval/rejection
// exception, which is keyed by its own `action` field.
const AUTO_LOCK_ACTIVITY_MESSAGE_NAMES: ReadonlySet<string> = new Set([
  LOCK_MANAGER_MESSAGES.SET_DECRYPTED_KEYS,
  LOCK_MANAGER_MESSAGES.ENCRYPT_ACCOUNT,
  LOCK_MANAGER_MESSAGES.UPDATE_AUTO_LOCK,
  LOCK_MANAGER_MESSAGES.USER_ACTIVITY,
]);

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
  // Counts the keystores this worker has stored since the last lock; see
  // isLocked.
  private static keystoreWrites = 0;
  // The number of locks in this worker's life. A lock ends a session. Every
  // flow that puts keys into memory or into session storage notes the
  // session it starts in, and writes nothing once a lock has ended it.
  private static session = 0;
  // Set by a lock, cleared when the wallet is unlocked or set up again.
  // While it is set nothing is restored: neither a session copy that a
  // failed removal left behind, nor the keys an open window still holds.
  private static lockedHere = false;
  // The operations on the session copy of the keys, run one after the
  // other in the order they were asked for.
  private static sessionOps: Promise<unknown> = Promise.resolve();
  static readonly AUTO_LOCK_ALARM = "QRL_AUTO_LOCK";
  static readonly KEEP_ALIVE_ALARM = "QRL_KEEP_ALIVE";
  private static readonly SESSION_KEYS_KEY = SESSION_KEYS_STORAGE_KEY;

  /**
   * Locks the wallet. The session ends first, in the same turn: from here on
   * no key is readable, and nothing that started earlier writes one back.
   * Then every cleanup step runs, whatever happens to the others. A step
   * that failed is reported once all of them are through.
   */
  static async lock() {
    this.session += 1;
    this.lockedHere = true;
    this.clearDecryptedKeys();
    this.walletPassword = undefined;
    this.keystoreWrites = 0;
    const steps = {
      "the LOCKED timestamp": StorageUtil.updateLockStateTimeStamp(
        LockState.LOCKED,
      ),
      "the session copy of the keys": this.clearSessionKeys(),
      "the keep-alive alarm": this.stopKeepAlive(),
      "the auto-lock alarm": this.clearAutoLockAlarm(),
    };
    const outcomes = await Promise.allSettled(Object.values(steps));
    const failed = Object.keys(steps).filter(
      (_step, index) => outcomes[index]?.status === "rejected",
    );
    if (failed.length > 0) {
      throw new Error(`${LOCK_CLEANUP_FAILED}: ${failed.join(", ")}`);
    }
  }

  /**
   * Removes a wallet that an earlier build stored: the keys in memory, their
   * session copy, and everything in local and session storage. It runs for an
   * outdated store only, when the user asks for it on the fresh-wallet
   * screen. A store that is current, or a newer build's, is left untouched;
   * that is the answer when another window has removed the wallet already.
   */
  static async resetOutdatedStorage() {
    if ((await StorageUtil.getStorageSchemaState()) !== "outdated") {
      return { removed: false };
    }
    try {
      await this.lock();
    } catch (error) {
      // The keys are out of memory. What a failed step left behind in
      // storage is removed right below.
      console.warn("QrlWeb3Wallet: lock before the removal", error);
    }
    await browser.storage.session.clear();
    await StorageUtil.clearAllData();
    await StorageUtil.markStorageSchemaCurrent();
    return { removed: true };
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
    await browser.storage.session.set({ [KEEP_ALIVE_SESSION_KEY]: Date.now() });
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
    try {
      await this.lock();
    } catch (error) {
      // The keys are gone from memory either way; see lock().
      console.error("QrlWeb3Wallet: auto-lock", error);
    }
  }

  /** Makes sure the auto-lock alarm exists, without postponing a running one. */
  private static async ensureAutoLockAlarm() {
    if (!(await browser.alarms.get(this.AUTO_LOCK_ALARM))) {
      await this.setupAutoLockAlarm();
    }
  }

  /**
   * Runs an operation on the session copy of the keys after every one asked
   * for before it. A write that is still under way when a lock removes the
   * copy can then never land after the removal.
   */
  private static queueSessionOp<Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const result = this.sessionOps.then(operation);
    this.sessionOps = result.catch(() => undefined);
    return result;
  }

  /**
   * Backup decrypted keys to session storage.
   * Session storage survives SW restarts but clears on browser close.
   * The backup is best effort: without it the wallet asks for the password
   * again after a restart of this worker.
   */
  private static async backupKeysToSession(session: number) {
    try {
      await this.queueSessionOp(async () => {
        // A lock since then ended that session. Its keys are not written.
        if (session !== this.session || !this.decryptedKeys) return;
        await browser.storage.session.set({
          [this.SESSION_KEYS_KEY]: this.decryptedKeys,
        });
      });
    } catch (error) {
      console.warn(
        "QrlWeb3Wallet: the session copy of the keys was not written",
        error,
      );
    }
  }

  private static clearSessionKeys() {
    return this.queueSessionOp(() =>
      browser.storage.session.remove(this.SESSION_KEYS_KEY),
    );
  }

  /**
   * Restore keys from session storage after SW restart.
   * Returns true if keys were restored.
   */
  static async restoreKeysFromSession(): Promise<boolean> {
    // A wallet that this worker locked stays locked. A session copy found
    // now is one that a failed removal left behind.
    if (this.lockedHere) return false;
    const session = this.session;
    try {
      const keys = await this.queueSessionOp(async () => {
        const data = await browser.storage.session.get(this.SESSION_KEYS_KEY);
        return data?.[this.SESSION_KEYS_KEY] as DecryptedKeyType[] | undefined;
      });
      if (!keys?.length) return false;
      // The same holds across a restart of this worker: the copy of a
      // wallet that was locked after its last unlock should not exist.
      const locked = await this.lockedSinceLastUnlock();
      // A lock during these reads ended the session the keys belong to.
      if (session !== this.session) return false;
      // An unlock or a new account during these reads set newer keys.
      // They stay, and so does the session copy written for them.
      if (this.decryptedKeys !== undefined) return true;
      if (locked) {
        await this.clearSessionKeys();
        return false;
      }
      this.decryptedKeys = keys;
      return true;
    } catch {
      // Session storage read failed — accept locked state
    }
    return false;
  }

  /**
   * Whether the wallet was locked after its last unlock, by the two
   * timestamps this worker writes. A tie counts as locked.
   */
  private static async lockedSinceLastUnlock(): Promise<boolean> {
    const lockedAt = await StorageUtil.getLockStateTimeStamp(LockState.LOCKED);
    const unlockedAt = await StorageUtil.getLockStateTimeStamp(
      LockState.UNLOCKED,
    );
    return lockedAt > 0 && lockedAt >= unlockedAt;
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
      const session = this.session;
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
          seed,
          mnemonicPhrases: getMnemonicFromHexSeed(seed),
        });
      }
      // A lock during the decryption ended the session it started in.
      if (session !== this.session) return false;
      this.walletPassword = normalisedPassword;
      await this.setDecryptedKeys(
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

  static async isLocked(): Promise<{
    isLocked: boolean;
    hasPasswordSet: boolean;
  }> {
    const keystoreWrites = this.keystoreWrites;
    const keyStores = await StorageUtil.getKeystores();
    const accounts = await StorageUtil.getAllAccounts();
    if (keystoreWrites !== this.keystoreWrites) {
      // encryptAccount stored a keystore while this read was under way. The
      // lists above can predate it, and judging by them would take the first
      // account of a new wallet for "no wallet" and drop the session that
      // was set a moment ago. Read again.
      return this.isLocked();
    }
    const hasPasswordSet = keyStores.length > 0 && accounts.length > 0;
    // The popup writes the account list on its own, and at first start it
    // can arrive after the keystore this worker has just stored. That is a
    // wallet being set up, and its session stays.
    const accountListPending = keyStores.length > 0 && this.keystoreWrites > 0;
    if (!hasPasswordSet && !accountListPending) {
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
   * This is the unlock itself, and a password change while unlocked. The
   * keys a window offers after a restart of this worker go to
   * restoreKeysFromPopup.
   */
  static async setDecryptedKeysFromPopup(
    payload: SetDecryptedKeysPayload | DecryptedKeyType[],
  ) {
    const keys = Array.isArray(payload) ? payload : payload.keys;
    if (!Array.isArray(payload) && payload.walletPassword) {
      this.walletPassword = payload.walletPassword;
    }
    await this.setDecryptedKeys(
      Array.from(
        new Map(
          keys.map((item) => [item.address.toLowerCase(), item]),
        ).values(),
      ),
    );
  }

  /**
   * Takes the keys an open window still holds from its own unlock, for a
   * worker that restarted and finds no session copy. This continues a
   * session and starts no new one. A wallet that was locked after its last
   * unlock stays locked, whatever the window believes: the worker that
   * locked it knows, and a later one reads the timestamps.
   *
   * The worker's own session copy comes first. It is the newer record:
   * another window may have added an account since this window took its
   * copy. A password is not taken from a window at all. This worker cannot
   * check one, and an account stored under a password that was changed in
   * another window since would make the next unlock fail for every account.
   * After a restart the password comes from the next unlock.
   * Returns true when the session goes on.
   */
  static async restoreKeysFromPopup(
    payload: SetDecryptedKeysPayload | DecryptedKeyType[],
  ): Promise<boolean> {
    if (this.lockedHere) return false;
    const session = this.session;
    if (this.decryptedKeys === undefined) {
      await this.restoreKeysFromSession();
    }
    // A lock during that read ended the session.
    if (session !== this.session) return false;
    if (this.decryptedKeys !== undefined) return true;
    const locked = await this.lockedSinceLastUnlock();
    if (locked || session !== this.session) return false;
    const keys = Array.from(
      new Map(
        (Array.isArray(payload) ? payload : payload.keys).map((item) => [
          item.address.toLowerCase(),
          item,
        ]),
      ).values(),
    );
    // No keys, no session.
    if (keys.length === 0) return false;
    // Keys that arrived during the read above are the newer ones.
    if (this.decryptedKeys === undefined) {
      this.decryptedKeys = keys;
      await this.backupKeysToSession(session);
    }
    // A lock while the copy was being written ended the session.
    return session === this.session;
  }

  static async encryptAccount(accountData: EncryptAccountType) {
    const { password: rawPassword, seed } = accountData;
    const password = rawPassword.normalize("NFC");
    // Never persist a keystore under an empty password: the KDF accepts ""
    // and the ciphertext is then trivially recomputable from the cleartext
    // salt stored beside it. Defence in depth behind getWalletPassword's own
    // guard below, which is the path every caller is expected to use.
    if (!password) {
      throw new Error("Refusing to encrypt an account without a password");
    }
    const session = this.session;
    const encryptedKeyStore = await encrypt(seed, password);
    // Read the stored list after the derivation, right before writing it
    // back, so an account stored meanwhile from another window is kept.
    const keystores = await StorageUtil.getKeystores();
    const updatedKeyStores = [...keystores, encryptedKeyStore];
    await StorageUtil.setKeystores(
      Array.from(
        new Map(
          updatedKeyStores.map((item) => [item.address.toLowerCase(), item]),
        ).values(),
      ),
    );
    // A lock while the account was being stored ended the session it
    // started in. The account is stored, and the wallet stays locked.
    if (session !== this.session) return;
    this.keystoreWrites += 1;
    // Add the new account key directly to in-memory keys
    // instead of re-decrypting everything (which would block the SW).
    const newKey: DecryptedKeyType = {
      address: encryptedKeyStore.address,
      seed: seed as string,
      mnemonicPhrases: getMnemonicFromHexSeed(seed as string),
    };
    this.walletPassword = password;
    const existingKeys = this.decryptedKeys ?? [];
    await this.setDecryptedKeys(
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

  /**
   * Takes the keys of an unlock or of a new account. The keys are readable
   * at once; the UNLOCKED timestamp of a session that starts here and the
   * session copy follow, and both are best effort.
   */
  private static async setDecryptedKeys(decryptedKeys: DecryptedKeyType[]) {
    const session = this.session;
    const startsSession = this.decryptedKeys === undefined;
    this.lockedHere = false;
    this.decryptedKeys = decryptedKeys;
    if (startsSession) {
      try {
        await StorageUtil.updateLockStateTimeStamp(LockState.UNLOCKED);
      } catch (error) {
        // With an UNLOCKED timestamp older than the LOCKED one, the wallet
        // asks for the password again after a restart of this worker.
        console.warn(
          "QrlWeb3Wallet: the UNLOCKED timestamp was not written",
          error,
        );
      }
    }
    await this.backupKeysToSession(session);
  }

  static getWalletPassword() {
    // Force the locked-state error if keys are gone.
    this.getDecryptedKeys();
    // After a service-worker restart the decrypted keys self-heal from
    // session storage, but the password does not: it is held in memory
    // only (see the field comment above). Returning "" here would let a
    // caller silently encrypt a new account's keystore under an empty
    // password. Fail closed: the caller asks the user to unlock again. No
    // password is taken from a window; see restoreKeysFromPopup().
    if (!this.walletPassword) {
      throw new Error("QRL Web3 Wallet password is unavailable");
    }
    return this.walletPassword;
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
    if (message.name === LOCK_MANAGER_MESSAGES.RESET_OUTDATED_STORAGE) {
      return await LockManager.resetOutdatedStorage();
    }
    // While a wallet stored by an earlier build waits for its removal, this
    // listener refuses every other message from an extension page. The
    // fresh-wallet screen is the only screen then, and it sends the removal
    // request alone.
    if ((await StorageUtil.getStorageSchemaState()) === "outdated") {
      throw new Error(OUTDATED_STORAGE_MESSAGE);
    }
    let result;
    if (message.name === LOCK_MANAGER_MESSAGES.IS_LOCKED) {
      result = await LockManager.isLocked();
    } else if (message.name === LOCK_MANAGER_MESSAGES.SET_DECRYPTED_KEYS) {
      // The popup decrypted the keystores locally and is sending us the results.
      const session = LockManager.session;
      await LockManager.setDecryptedKeysFromPopup(message?.data ?? []);
      // No alarm for a session that a lock has ended meanwhile. The
      // auto-lock alarm is set below, with the other user activity.
      if (session === LockManager.session) {
        await LockManager.startKeepAlive();
      }
      result = { success: true };
    } else if (message.name === LOCK_MANAGER_MESSAGES.RESTORE_DECRYPTED_KEYS) {
      const restored = await LockManager.restoreKeysFromPopup(
        message?.data ?? [],
      );
      if (restored) {
        await LockManager.startKeepAlive();
        await LockManager.ensureAutoLockAlarm();
      }
      result = { success: restored };
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
    } else if (message.name === LOCK_MANAGER_MESSAGES.USER_ACTIVITY) {
      result = { success: true };
    }

    // Only a deliberate user action or user-initiated write postpones the
    // inactivity auto-lock: the allow-list above, plus the dApp
    // approval/rejection response, the one activity signal carrying an
    // `action` field (see MessageType above) as its discriminator.
    // Everything else this global listener happens to overhear, reads
    // (IS_LOCKED, GET_*) and any other message, leaves the timer alone.
    const isUserActivity =
      (typeof message.name === "string" &&
        AUTO_LOCK_ACTIVITY_MESSAGE_NAMES.has(message.name)) ||
      message.action === EXTENSION_MESSAGES.DAPP_RESPONSE;
    if (isUserActivity && LockManager.decryptedKeys === undefined) {
      // After a restart of this worker the keys come back with the first
      // lock-state read. Activity that arrives before it counts as well.
      await LockManager.restoreKeysFromSession();
    }
    if (isUserActivity && LockManager.decryptedKeys !== undefined) {
      await LockManager.setupAutoLockAlarm();
    }

    return result;
  }
}

export default LockManager;
