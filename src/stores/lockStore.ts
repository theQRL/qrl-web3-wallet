import {
  DecryptedKeyType,
  EncryptAccountType,
  KEEP_ALIVE_SESSION_KEY,
  LOCK_MANAGER_MESSAGES,
} from "@/scripts/lockManager/lockManager";
import type {
  ChangePasswordWorkerResponse,
} from "@/scripts/workers/changePasswordWorker";
import StorageUtil, {
  LockState,
  PRICE_CACHE_IDENTIFIER,
} from "@/utilities/storageUtil";
import { KeyStore, Web3BaseWalletAccount } from "@theqrl/web3";
import { action, makeAutoObservable, runInAction } from "mobx";
import browser from "webextension-polyfill";

const PORT_RECONNECT_DELAY = 1000;

// Storage keys written by automated background traffic: a storage change
// limited to these keys must not trigger readLockState() (which pings the
// SW and can run the SET_DECRYPTED_KEYS resend path), or the periodic price
// refresh and the ~30s keep-alive tick would keep this store busy, and the
// inactivity auto-lock effectively reset, for no user activity at all. The
// session-storage decrypted-keys backup itself is deliberately NOT in this
// set: a change there is how one surface learns another surface just
// unlocked (or locked) the wallet, and must still drive readLockState().
const AUTOMATED_LOCAL_STORAGE_KEYS = new Set([PRICE_CACHE_IDENTIFIER]);
const AUTOMATED_SESSION_STORAGE_KEYS = new Set([KEEP_ALIVE_SESSION_KEY]);

// At most one USER_ACTIVITY ping per this many ms, so a user actively
// moving the mouse or typing in an open surface does not flood the SW with
// messages; see registerActivityPing().
const ACTIVITY_PING_THROTTLE_MS = 30_000;

class LockStore {
  hasPasswordSet = true;
  isLoading = true;
  isLocked = true;
  private keepAlivePort?: browser.Runtime.Port;
  /**
   * Cached copy of decrypted keys so the popup can re-send them to the SW
   * if Chrome restarts it (losing its in-memory state).  Cleared on lock().
   */
  private cachedKeys?: DecryptedKeyType[];
  /**
   * Wallet password held in popup memory only — paired with cachedKeys so
   * the popup can re-arm the SW after a Chrome-driven restart without
   * re-prompting the user. Stored separately from `cachedKeys` so leaks of
   * either store do not necessarily leak both.
   */
  private cachedPassword?: string;
  /** Timestamp of the last USER_ACTIVITY ping sent, for throttling. */
  private lastActivityPingAt = 0;

  constructor() {
    makeAutoObservable(this, {
      getWalletPassword: action.bound,
      getMnemonicPhrases: action.bound,
      getAccountSeed: action.bound,
      encryptAccount: action.bound,
      changePassword: action.bound,
      readLockState: action.bound,
      lock: action.bound,
      unlock: action.bound,
    });

    this.connectKeepAlive();
    this.initialize();
    this.registerActivityPing();
  }

  /**
   * Auto-lock semantics: the wallet locks after N minutes with no user
   * interaction in any open wallet surface (popup, side panel, or tab). A
   * surface left open and actively used, clicking, typing, scrolling a
   * list, or simply being the visible tab, sends this throttled ping so the
   * SW can tell that apart from an idle-but-open one. See lockManager.ts's
   * USER_ACTIVITY message and its auto-lock activity allow-list.
   */
  private registerActivityPing() {
    if (typeof document === "undefined") return;
    const ping = () => {
      const now = Date.now();
      if (now - this.lastActivityPingAt < ACTIVITY_PING_THROTTLE_MS) {
        return;
      }
      this.lastActivityPingAt = now;
      browser.runtime
        .sendMessage({ name: LOCK_MANAGER_MESSAGES.USER_ACTIVITY })
        .catch(() => {
          // SW not reachable right now - the next activity tick, or the
          // keep-alive port reconnect, will retry. Not worth surfacing.
        });
    };
    const passiveListener: AddEventListenerOptions = { passive: true };
    document.addEventListener("pointerdown", ping, passiveListener);
    document.addEventListener("keydown", ping, passiveListener);
    document.addEventListener("wheel", ping, passiveListener);
    document.addEventListener("focus", ping, true);
    // Capture: a scrolling container (e.g. the account/history list) fires
    // its own scroll event, which does not bubble. A capturing listener on
    // document still sees it.
    document.addEventListener("scroll", ping, { passive: true, capture: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") ping();
    });
  }

  /**
   * Keep a long-lived port open to the service worker.
   * As long as a port is connected, Chrome keeps the MV3 SW alive.
   * This prevents the "Receiving end does not exist" error that occurs
   * when Chrome fails to restart a module-type service worker.
   */
  private connectKeepAlive() {
    try {
      this.keepAlivePort?.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      this.keepAlivePort = browser.runtime.connect({
        name: LOCK_MANAGER_MESSAGES.LOCK_MANAGER_KEEP_LIVE,
      });
      this.keepAlivePort.onDisconnect.addListener(() => {
        // SW dropped the port — reconnect to wake it back up
        setTimeout(() => this.connectKeepAlive(), PORT_RECONNECT_DELAY);
      });
    } catch {
      // Connection failed (SW not ready yet), retry
      setTimeout(() => this.connectKeepAlive(), PORT_RECONNECT_DELAY);
    }
  }

  /**
   * Boot sequence: try to reach the service worker with quick retries,
   * then start the storage listener.
   */
  private async initialize() {
    // Give the port connection a moment to wake the SW
    await new Promise((r) => setTimeout(r, 200));

    for (let i = 0; i < 10; i++) {
      try {
        const { isLocked, hasPasswordSet } =
          await browser.runtime.sendMessage({
            name: LOCK_MANAGER_MESSAGES.IS_LOCKED,
          });
        runInAction(() => {
          this.isLocked = isLocked;
          this.hasPasswordSet = hasPasswordSet;
          this.isLoading = false;
        });
        break;
      } catch {
        // Also try reconnecting the port to wake the SW
        this.connectKeepAlive();
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      }
    }

    if (this.isLoading) {
      runInAction(() => {
        this.isLoading = false;
      });
    }

    this.initializeStorageListener();
  }

  initializeStorageListener() {
    browser.storage.onChanged.addListener(async (changes, areaName) => {
      const changedKeys = Object.keys(changes);
      if (changedKeys.length === 0) return;
      // Ignore storage changes that are entirely automated background
      // traffic (the periodic price refresh, the ~30s keep-alive tick):
      // reacting to them would poll the SW (readLockState) for no user
      // activity at all, and the wallet would effectively never look idle
      // while any surface stays open. See the constants above.
      if (
        areaName === "local" &&
        changedKeys.every((key) => AUTOMATED_LOCAL_STORAGE_KEYS.has(key))
      ) {
        return;
      }
      if (
        areaName === "session" &&
        changedKeys.every((key) => AUTOMATED_SESSION_STORAGE_KEYS.has(key))
      ) {
        return;
      }
      await this.readLockState();
    });
  }

  async getWalletPassword() {
    const password = await browser.runtime.sendMessage({
      name: LOCK_MANAGER_MESSAGES.GET_WALLET_PASSWORD,
    });
    return password;
  }

  async getMnemonicPhrases(accountAddress: string) {
    const decryptedKeys: DecryptedKeyType[] =
      await browser.runtime.sendMessage({
        name: LOCK_MANAGER_MESSAGES.GET_DECRYPTED_KEYS,
      });
    const accountKey = decryptedKeys?.find(
      (key) => key?.address?.toLowerCase() === accountAddress?.toLowerCase(),
    );
    const mnemonicPhrases: string = accountKey?.mnemonicPhrases ?? "";
    return mnemonicPhrases;
  }

  async getAccountSeed(accountAddress: string) {
    const decryptedKeys: DecryptedKeyType[] =
      await browser.runtime.sendMessage({
        name: LOCK_MANAGER_MESSAGES.GET_DECRYPTED_KEYS,
      });
    const accountKey = decryptedKeys?.find(
      (key) => key?.address?.toLowerCase() === accountAddress?.toLowerCase(),
    );
    return accountKey?.seed ?? "";
  }

  async encryptAccount(account: Web3BaseWalletAccount, password: string) {
    const accountData: EncryptAccountType = {
      seed: account?.seed ?? "",
      password: password ?? "",
    };
    await browser.runtime.sendMessage({
      name: LOCK_MANAGER_MESSAGES.ENCRYPT_ACCOUNT,
      data: accountData,
    });
  }

  /**
   * Change the wallet password.  Decrypts all keystores with the old password,
   * re-encrypts them with the new password in a Web Worker, then persists the
   * new keystores and updates the in-memory keys in the service worker.
   *
   * Returns true on success, false if the old password is wrong.
   */
  async changePassword(
    oldPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const keyStores = await StorageUtil.getKeystores();
    if (!keyStores.length) return false;

    const result = await new Promise<ChangePasswordWorkerResponse>(
      (resolve) => {
        const worker = new Worker(
          new URL(
            "../scripts/workers/changePasswordWorker.ts",
            import.meta.url,
          ),
          { type: "module" },
        );
        worker.onmessage = (
          event: MessageEvent<ChangePasswordWorkerResponse>,
        ) => {
          worker.terminate();
          resolve(event.data);
        };
        worker.onerror = () => {
          worker.terminate();
          resolve({ success: false });
        };
        worker.postMessage({ keystores: keyStores, oldPassword, newPassword });
      },
    );

    if (!result.success) return false;

    // Persist re-encrypted keystores.
    await StorageUtil.setKeystores(result.newKeystores);

    // Update in-memory keys + walletPassword in the service worker.
    const normalisedNewPassword = newPassword.normalize("NFC");
    try {
      await this.sendWithRetry({
        name: LOCK_MANAGER_MESSAGES.SET_DECRYPTED_KEYS,
        data: {
          keys: result.newKeys,
          walletPassword: normalisedNewPassword,
        },
      });
    } catch {
      // Keys are persisted — SW will pick them up on next unlock.
    }

    this.cachedKeys = result.newKeys as DecryptedKeyType[];
    this.cachedPassword = normalisedNewPassword;
    return true;
  }

  async readLockState() {
    try {
      let { isLocked, hasPasswordSet } = await browser.runtime.sendMessage({
        name: LOCK_MANAGER_MESSAGES.IS_LOCKED,
      });

      // If the SW lost its in-memory keys (e.g. Chrome restarted it) but we
      // still have a cached copy from the last successful unlock, re-send them
      // so the wallet stays unlocked while the popup is open.
      if (isLocked && this.cachedKeys) {
        const lockedTs = await StorageUtil.getLockStateTimeStamp(
          LockState.LOCKED,
        );
        const unlockedTs = await StorageUtil.getLockStateTimeStamp(
          LockState.UNLOCKED,
        );
        if (lockedTs > unlockedTs) {
          // Intentional lock (manual or auto-lock) — don't re-send
          this.cachedKeys = undefined;
          this.cachedPassword = undefined;
        } else {
          // SW restart — re-send cached keys (and password if known) to recover
          try {
            await browser.runtime.sendMessage({
              name: LOCK_MANAGER_MESSAGES.SET_DECRYPTED_KEYS,
              data: this.cachedPassword
                ? {
                    keys: this.cachedKeys,
                    walletPassword: this.cachedPassword,
                  }
                : this.cachedKeys,
            });
            const recheck = await browser.runtime.sendMessage({
              name: LOCK_MANAGER_MESSAGES.IS_LOCKED,
            });
            isLocked = recheck.isLocked;
            hasPasswordSet = recheck.hasPasswordSet;
          } catch {
            // Re-send failed — accept the locked state
          }
        }
      }

      this.isLocked = isLocked;
      this.hasPasswordSet = hasPasswordSet;
      this.isLoading = false;
    } catch {
      // SW not reachable – will be retried via port reconnect or storage listener
    }
  }

  async lock() {
    this.cachedKeys = undefined;
    this.cachedPassword = undefined;
    await browser.runtime.sendMessage({
      name: LOCK_MANAGER_MESSAGES.LOCK,
    });
    const { isLocked } = await browser.runtime.sendMessage({
      name: LOCK_MANAGER_MESSAGES.IS_LOCKED,
    });
    this.isLocked = isLocked;
    StorageUtil.updateLockStateTimeStamp(LockState.LOCKED);
  }

  /**
   * Send a message to the service worker with automatic retries.
   * Each retry also reconnects the keep-alive port to ensure the SW is awake.
   */
  private async sendWithRetry(
    message: Record<string, unknown>,
    maxRetries = 3,
  ): Promise<unknown> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await browser.runtime.sendMessage(message);
      } catch (error) {
        if (attempt === maxRetries) throw error;
        this.connectKeepAlive();
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }

  /**
   * Unlock the wallet.  The CPU-heavy scrypt decryption runs in a dedicated
   * Web Worker thread so the popup UI stays fully responsive (spinner animates).
   * After decryption the keys are sent to the SW for in-memory storage.
   *
   * Returns true on success, false on wrong password.
   * Throws on communication errors so the UI can show a distinct message.
   */
  async unlock(password: string): Promise<boolean> {
    // Read keystores and decrypt in a Web Worker (separate thread).
    const keyStores = await StorageUtil.getKeystores();
    if (!keyStores.length) return false;

    const workerResult = await new Promise<{
      keys: DecryptedKeyType[];
      upgradedKeystores?: KeyStore[];
    } | null>((resolve) => {
      const worker = new Worker(
        new URL("../scripts/workers/unlockWorker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (
        event: MessageEvent<{
          success: boolean;
          keys?: DecryptedKeyType[];
          upgradedKeystores?: KeyStore[];
        }>,
      ) => {
        worker.terminate();
        if (event.data.success && event.data.keys) {
          resolve({
            keys: event.data.keys,
            upgradedKeystores: event.data.upgradedKeystores,
          });
        } else {
          resolve(null);
        }
      };
      worker.onerror = () => {
        worker.terminate();
        resolve(null);
      };
      worker.postMessage({ keystores: keyStores, password });
    });

    if (!workerResult) {
      // Wrong password or worker error
      return false;
    }
    const decryptedKeys = workerResult.keys;

    // If the worker re-encrypted any keystores with stronger KDF parameters,
    // persist them in place of the previous keystores so the user benefits
    // automatically without re-entering their password.
    if (workerResult.upgradedKeystores?.length) {
      try {
        await StorageUtil.setKeystores(workerResult.upgradedKeystores);
      } catch (error) {
        console.warn(
          "QrlWeb3Wallet: failed to persist upgraded keystores",
          error,
        );
      }
    }

    // Send decrypted keys + walletPassword to the service worker.
    const normalisedPassword = password.normalize("NFC");
    try {
      await this.sendWithRetry({
        name: LOCK_MANAGER_MESSAGES.SET_DECRYPTED_KEYS,
        data: { keys: decryptedKeys, walletPassword: normalisedPassword },
      });
    } catch {
      throw new Error(
        "Unable to communicate with the wallet service. Please check your connection and try again.",
      );
    }

    // Verify the SW now considers us unlocked.
    try {
      const { isLocked } = await browser.runtime.sendMessage({
        name: LOCK_MANAGER_MESSAGES.IS_LOCKED,
      });
      runInAction(() => {
        this.isLocked = isLocked;
      });
      if (!isLocked) {
        this.cachedKeys = decryptedKeys;
        this.cachedPassword = normalisedPassword;
        StorageUtil.updateLockStateTimeStamp(LockState.UNLOCKED);
        return true;
      }
    } catch {
      // Verification failed — but keys were sent successfully
    }

    return false;
  }
}

export default LockStore;
