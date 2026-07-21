import {
  DecryptedKeyType,
  EncryptAccountType,
  LOCK_MANAGER_MESSAGES,
} from "@/scripts/lockManager/lockManager";
import type {
  ChangePasswordWorkerRequest,
  ChangePasswordWorkerResponse,
} from "@/scripts/workers/changePasswordWorker";
import type {
  UnlockWorkerRequest,
  UnlockWorkerResponse,
} from "@/scripts/workers/unlockWorker";
import {
  kdfWorkerCount,
  runWorkerJob,
  splitIntoChunks,
} from "@/scripts/workers/keystoreWorkerPool";
import StorageUtil, { LockState } from "@/utilities/storageUtil";
import { Web3BaseWalletAccount } from "@theqrl/web3";
import { action, makeAutoObservable, runInAction } from "mobx";
import browser from "webextension-polyfill";

const PORT_RECONNECT_DELAY = 1000;

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
    browser.storage.onChanged.addListener(async () => {
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

    // Fan the keystores out over several workers so the argon2id runs
    // execute concurrently (contiguous chunks keep the original order when
    // the per-chunk results are concatenated back together).
    const runChangeChunks = (chunks: (typeof keyStores)[]) =>
      Promise.all(
        chunks.map((chunk) =>
          runWorkerJob<
            ChangePasswordWorkerRequest,
            ChangePasswordWorkerResponse
          >(
            () =>
              new Worker(
                new URL(
                  "../scripts/workers/changePasswordWorker.ts",
                  import.meta.url,
                ),
                { type: "module" },
              ),
            { keystores: chunk, oldPassword, newPassword },
            { success: false, wrongPassword: false },
          ),
        ),
      );

    let responses = await runChangeChunks(
      splitIntoChunks(keyStores, kdfWorkerCount(keyStores.length)),
    );
    if (responses.some((r) => !r.success && r.wrongPassword)) return false;
    if (responses.some((r) => !r.success)) {
      // Infrastructure failure, not a wrong password: retry sequentially in
      // one worker (peak memory of the old single-worker path).
      responses = await runChangeChunks([keyStores]);
    }

    const succeeded = responses.filter(
      (r): r is Extract<ChangePasswordWorkerResponse, { success: true }> =>
        r.success,
    );
    if (succeeded.length !== responses.length) return false;
    const result = {
      newKeystores: succeeded.flatMap((r) => r.newKeystores),
      newKeys: succeeded.flatMap((r) => r.newKeys),
    };

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
   * Unlock the wallet.  The CPU-heavy argon2id decryption runs in dedicated
   * Web Worker threads (one per keystore chunk, capped by
   * keystoreWorkerPool) so the popup UI stays fully responsive and multiple
   * keystores decrypt concurrently.
   * After decryption the keys are sent to the SW for in-memory storage.
   *
   * Returns true on success, false on wrong password.
   * Throws on communication errors so the UI can show a distinct message.
   */
  async unlock(password: string): Promise<boolean> {
    // Read keystores and decrypt in Web Workers (separate threads).
    const keyStores = await StorageUtil.getKeystores();
    if (!keyStores.length) return false;

    // Contiguous chunks keep the original keystore order when the per-chunk
    // results are concatenated back together.
    const runUnlockChunks = (chunks: (typeof keyStores)[]) =>
      Promise.all(
        chunks.map((chunk) =>
          runWorkerJob<UnlockWorkerRequest, UnlockWorkerResponse>(
            () =>
              new Worker(
                new URL("../scripts/workers/unlockWorker.ts", import.meta.url),
                { type: "module" },
              ),
            { keystores: chunk, password },
            { success: false, wrongPassword: false },
          ),
        ),
      );

    let responses = await runUnlockChunks(
      splitIntoChunks(keyStores, kdfWorkerCount(keyStores.length)),
    );
    if (responses.some((r) => !r.success && r.wrongPassword)) {
      return false;
    }
    if (responses.some((r) => !r.success)) {
      // Infrastructure failure (e.g. concurrent WASM argon2id instances
      // exhausted memory), NOT a wrong password. Retry everything in one
      // sequential worker, whose peak memory matches the old single-worker
      // path, before giving up.
      responses = await runUnlockChunks([keyStores]);
      const retry = responses[0];
      if (retry && !retry.success) {
        if (retry.wrongPassword) return false;
        throw new Error(
          "Unable to decrypt the wallet on this device right now. Close other tabs or apps to free memory and try again.",
        );
      }
    }

    const succeeded = responses.filter(
      (r): r is Extract<UnlockWorkerResponse, { success: true }> => r.success,
    );
    if (succeeded.length !== responses.length) {
      return false;
    }
    const decryptedKeys: DecryptedKeyType[] = succeeded.flatMap((r) => r.keys);

    // If a worker re-encrypted any keystores with stronger KDF parameters,
    // persist them in place of the previous keystores so the user benefits
    // automatically without re-entering their password. The flattened
    // upgraded list is index-aligned with keyStores.
    const upgradedFlat = succeeded.flatMap((r) => r.upgraded);
    if (upgradedFlat.some((k) => k !== null)) {
      const mergedKeystores = keyStores.map(
        (original, index) => upgradedFlat[index] ?? original,
      );
      try {
        await StorageUtil.setKeystores(mergedKeystores);
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
