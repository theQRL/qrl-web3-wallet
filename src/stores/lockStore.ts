import {
  DecryptedKeyType,
  EncryptAccountType,
  KEEP_ALIVE_SESSION_KEY,
  LOCK_CLEANUP_FAILED,
  LOCK_MANAGER_MESSAGES,
} from "@/scripts/lockManager/lockManager";
import type {
  ChangePasswordWorkerResponse,
} from "@/scripts/workers/changePasswordWorker";
import StorageUtil, {
  LockState,
  PRICE_CACHE_IDENTIFIER,
  type StorageSchemaState,
} from "@/utilities/storageUtil";
import { KeyStore, Web3BaseWalletAccount } from "@theqrl/web3";
import { action, makeAutoObservable, runInAction } from "mobx";
import browser from "webextension-polyfill";

const PORT_RECONNECT_DELAY = 1000;

// Storage keys written by automated background traffic: a storage change
// limited to these keys must not trigger readLockState() (which pings the
// SW and can run the RESTORE_DECRYPTED_KEYS path), or the periodic price
// refresh and the ~30s keep-alive tick would keep this store asking the
// service worker for the lock state for no user activity at all. The
// session-storage decrypted-keys backup itself is deliberately NOT in this
// set: a change there is how one surface learns another surface just
// unlocked (or locked) the wallet, and must still drive readLockState().
const AUTOMATED_LOCAL_STORAGE_KEYS = new Set([PRICE_CACHE_IDENTIFIER]);
const AUTOMATED_SESSION_STORAGE_KEYS = new Set([KEEP_ALIVE_SESSION_KEY]);

// The service worker's answer to RESTORE_DECRYPTED_KEYS: whether it took
// the keys this window offered.
const wasTaken = (answer: unknown) =>
  typeof answer === "object" &&
  answer !== null &&
  "success" in answer &&
  answer.success === true;

// The service worker's report that it locked the wallet and one of its
// cleanup steps failed; see LockManager.lock().
const isCleanupReport = (error: unknown) =>
  error instanceof Error && error.message.includes(LOCK_CLEANUP_FAILED);

// At most one USER_ACTIVITY ping per this many ms, so a user actively
// moving the mouse or typing in an open surface does not flood the SW with
// messages; see registerActivityPing().
const ACTIVITY_PING_THROTTLE_MS = 30_000;

class LockStore {
  hasPasswordSet = true;
  isLoading = true;
  isLocked = true;
  /**
   * Whether the stored wallet is one this build opens. For "outdated" the
   * fresh-wallet screen is the only screen shown.
   */
  storageState: StorageSchemaState | "checking" = "checking";
  /**
   * True while the first-run onboarding is on screen in this page. The wallet
   * reads as unlocked as soon as the first keystore is written, but the
   * onboarding still has steps to show (recovery phrase download and its
   * confirmation), so the screen must not switch to the wallet yet.
   */
  isOnboarding = false;
  private keepAlivePort?: browser.Runtime.Port;
  /**
   * Cached copy of decrypted keys so the popup can offer them to the SW
   * if Chrome restarts it (losing its in-memory state).  Cleared on lock().
   * The password is not kept here: see getWalletPassword().
   */
  private cachedKeys?: DecryptedKeyType[];
  /** Timestamp of the last USER_ACTIVITY ping sent, for throttling. */
  private lastActivityPingAt = 0;

  constructor() {
    makeAutoObservable(this, {
      setOnboarding: action.bound,
      getWalletPassword: action.bound,
      getMnemonicPhrases: action.bound,
      getAccountSeed: action.bound,
      encryptAccount: action.bound,
      changePassword: action.bound,
      readLockState: action.bound,
      resetOutdatedStorage: action.bound,
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
   * surface left open and actively used, clicking, typing, turning the
   * wheel, or coming back to the tab, sends this throttled ping so the
   * SW can tell that apart from an idle-but-open one. See lockManager.ts's
   * USER_ACTIVITY message and its auto-lock activity allow-list.
   *
   * Only events of an input device count. "scroll" and "focus" also fire
   * with nobody at the keyboard, when a list that refreshes moves the page
   * or a dialog takes the focus, and would keep an idle wallet unlocked.
   * Scrolling by hand arrives as a wheel, pointer or key event anyway.
   */
  private registerActivityPing() {
    if (typeof document === "undefined") return;
    const ping = () => {
      // The service worker answers no lock request for a wallet stored by an
      // earlier build, so none is sent from its screen.
      if (this.storageState === "outdated") return;
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
    const storageState = await this.readStorageState();
    runInAction(() => {
      this.storageState = storageState;
    });
    if (storageState === "outdated") {
      // The service worker refuses every lock request until the old wallet
      // is removed, so none is sent.
      runInAction(() => {
        this.isLoading = false;
      });
      return;
    }

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

  private async readStorageState(): Promise<StorageSchemaState> {
    try {
      return await StorageUtil.getStorageSchemaState();
    } catch {
      // Storage that cannot be read fails in the usual flow, where the
      // service worker decides.
      return "current";
    }
  }

  setOnboarding(isOnboarding: boolean) {
    this.isOnboarding = isOnboarding;
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

  /**
   * The service worker holds the password in memory only and loses it when
   * Chrome restarts it, even though the decrypted keys come back from
   * session storage (so the wallet still reads as unlocked). It rejects
   * this message then, and the caller asks the user to unlock again.
   *
   * This window does not hand a copy of its own back. The service worker
   * cannot check a password, and one that was changed in another window
   * since this window unlocked would go under the next account: a wallet
   * with keystores under two passwords does not unlock any more.
   */
  async getWalletPassword(): Promise<string> {
    return await browser.runtime.sendMessage({
      name: LOCK_MANAGER_MESSAGES.GET_WALLET_PASSWORD,
    });
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
    // Never persist a keystore under an empty password. The service worker
    // refuses this too; failing here as well keeps the guarantee visible at
    // the call site and avoids a round trip for a request that can never
    // succeed.
    if (!password) {
      throw new Error("Refusing to encrypt an account without a password");
    }
    const accountData: EncryptAccountType = {
      seed: account?.seed ?? "",
      password,
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

    // A change takes three key derivations per account, and nothing goes
    // to the service worker while they run. The auto-lock counts user
    // activity only, so the wallet says here that it is at work for the
    // user: without this a long change is cut by the auto-lock, and its
    // result would then open the wallet again.
    const atWork = () => {
      this.lastActivityPingAt = Date.now();
      browser.runtime
        .sendMessage({ name: LOCK_MANAGER_MESSAGES.USER_ACTIVITY })
        .catch(() => {
          // Not reachable right now; the next one follows.
        });
    };
    atWork();
    const whileAtWork = setInterval(atWork, ACTIVITY_PING_THROTTLE_MS);
    let result: ChangePasswordWorkerResponse;
    try {
      result = await new Promise<ChangePasswordWorkerResponse>((resolve) => {
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
      });
    } finally {
      clearInterval(whileAtWork);
    }

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
    return true;
  }

  /**
   * Asks the service worker to remove a wallet that an earlier build stored.
   * Only the fresh-wallet screen calls this, after the user confirmed. It
   * also resolves when there was nothing left to remove, and rejects when
   * the wallet could not be removed.
   */
  async resetOutdatedStorage() {
    await browser.runtime.sendMessage({
      name: LOCK_MANAGER_MESSAGES.RESET_OUTDATED_STORAGE,
    });
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
        } else {
          // SW restart: offer the cached keys to recover. The service
          // worker decides: one that locked the wallet itself refuses them,
          // whatever the timestamps say here.
          try {
            const offer: unknown = await browser.runtime.sendMessage({
              name: LOCK_MANAGER_MESSAGES.RESTORE_DECRYPTED_KEYS,
              data: this.cachedKeys,
            });
            if (wasTaken(offer)) {
              const recheck = await browser.runtime.sendMessage({
                name: LOCK_MANAGER_MESSAGES.IS_LOCKED,
              });
              isLocked = recheck.isLocked;
              hasPasswordSet = recheck.hasPasswordSet;
            } else {
              this.cachedKeys = undefined;
            }
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

  /**
   * Locks the wallet. The service worker writes the LOCKED timestamp as a
   * step of its own lock, so no window can see the wallet locked and
   * the timestamp still missing because this one was slow to write it.
   * The service worker clears the keys first and reports a failed cleanup
   * step afterwards. The wallet is locked all the same, so that report is
   * logged. A request that did not reach the service worker is another
   * matter: it is sent again, and thrown when it still does not arrive.
   */
  async lock() {
    this.cachedKeys = undefined;
    try {
      await this.sendWithRetry({ name: LOCK_MANAGER_MESSAGES.LOCK });
    } catch (error) {
      if (!isCleanupReport(error)) throw error;
      console.error("QrlWeb3Wallet: lock", error);
    }
    const { isLocked } = await browser.runtime.sendMessage({
      name: LOCK_MANAGER_MESSAGES.IS_LOCKED,
    });
    runInAction(() => {
      this.isLocked = isLocked;
    });
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
        // The service worker wrote the UNLOCKED timestamp when it took the
        // keys.
        this.cachedKeys = decryptedKeys;
        return true;
      }
    } catch {
      // Verification failed — but keys were sent successfully
    }

    return false;
  }
}

export default LockStore;
