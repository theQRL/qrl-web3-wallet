import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Plain object stores (hoisting-safe) ────────────────────────────
const localStore: Record<string, any> = {};
const sessionStore: Record<string, any> = {};
const alarmsStore: Record<string, any> = {};

vi.mock("webextension-polyfill", () => ({
  __esModule: true,
  default: {
    storage: {
      local: {
        get: vi.fn((key: string) =>
          Promise.resolve(
            key in localStore ? { [key]: localStore[key] } : {},
          ),
        ),
        set: vi.fn((data: Record<string, any>) => {
          Object.assign(localStore, data);
          return Promise.resolve();
        }),
        remove: vi.fn((key: string) => {
          delete localStore[key];
          return Promise.resolve();
        }),
        clear: vi.fn(() => {
          for (const k of Object.keys(localStore)) delete localStore[k];
          return Promise.resolve();
        }),
      },
      session: {
        get: vi.fn((key: string) =>
          Promise.resolve(
            key in sessionStore ? { [key]: sessionStore[key] } : {},
          ),
        ),
        set: vi.fn((data: Record<string, any>) => {
          Object.assign(sessionStore, data);
          return Promise.resolve();
        }),
        remove: vi.fn((key: string) => {
          delete sessionStore[key];
          return Promise.resolve();
        }),
      },
    },
    alarms: {
      create: vi.fn((name: string, info: any) => {
        alarmsStore[name] = info;
        return Promise.resolve();
      }),
      clear: vi.fn((name: string) => {
        delete alarmsStore[name];
        return Promise.resolve(true);
      }),
      get: vi.fn((name: string) =>
        Promise.resolve(alarmsStore[name] ?? null),
      ),
    },
  },
}));

vi.mock("@theqrl/web3", () => ({ Bytes: class {} }));
vi.mock("@theqrl/web3-qrl-accounts", () => ({
  decrypt: vi.fn(),
  encrypt: vi.fn(),
}));
vi.mock("@/functions/getMnemonicFromHexSeed", () => ({
  getMnemonicFromHexSeed: vi.fn(() => "mocked mnemonic"),
}));

import browser from "webextension-polyfill";
import { encrypt } from "@theqrl/web3-qrl-accounts";
import StorageUtil, { STORAGE_SCHEMA_VERSION } from "@/utilities/storageUtil";
import LockManager, { LOCK_MANAGER_MESSAGES } from "./lockManager";
import type { DecryptedKeyType } from "./lockManager";

const mockEncrypt = encrypt as unknown as ReturnType<typeof vi.fn>;

const mockAlarms = browser.alarms as any;

const clearStore = (store: Record<string, any>) => {
  for (const k of Object.keys(store)) delete store[k];
};

// A restart of the service worker: its memory starts empty, and storage is
// what the last worker left.
const restartWorker = () => {
  Object.assign(LockManager, {
    decryptedKeys: undefined,
    walletPassword: undefined,
    keystoreWrites: 0,
    session: 0,
    lockedHere: false,
    sessionOps: Promise.resolve(),
  });
};

const MOCK_KEYS: DecryptedKeyType[] = [
  {
    address: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
    seed: "0x010000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    mnemonicPhrases: "mocked mnemonic",
  },
];

describe("LockManager – keep-alive & auto-lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStore(localStore);
    clearStore(sessionStore);
    clearStore(alarmsStore);
    // Every test starts on a store this build wrote, in a worker that has
    // just started.
    localStore["STORAGE_SCHEMA_VERSION"] = STORAGE_SCHEMA_VERSION;
    restartWorker();
  });

  // ── startKeepAlive / stopKeepAlive (periodic alarm) ────────────

  describe("startKeepAlive", () => {
    it("should create a periodic alarm", async () => {
      await LockManager.startKeepAlive();

      expect(mockAlarms.create).toHaveBeenCalledWith(LockManager.KEEP_ALIVE_ALARM, {
        periodInMinutes: 0.4,
      });
    });
  });

  describe("stopKeepAlive", () => {
    it("should clear the keep-alive alarm", async () => {
      await LockManager.stopKeepAlive();

      expect(mockAlarms.clear).toHaveBeenCalledWith(LockManager.KEEP_ALIVE_ALARM);
    });
  });

  // ── handleKeepAliveAlarm ───────────────────────────────────────

  describe("handleKeepAliveAlarm", () => {
    it("should write to session storage", async () => {
      await LockManager.handleKeepAliveAlarm();

      expect(sessionStore.keepAlive).toBeDefined();
      expect(typeof sessionStore.keepAlive).toBe("number");
    });

    it("should restore keys from session if SW restarted", async () => {
      // Simulate: keys backed up in session, but in-memory is empty (SW restart)
      sessionStore["_LM_CACHED_KEYS"] = MOCK_KEYS;

      await LockManager.handleKeepAliveAlarm();

      // Keys should be restored — wallet unlocked
      localStore["KEYSTORES"] = JSON.stringify([{ address: "0x123" }]);
      localStore["ACCOUNTS"] = { ALL_ACCOUNTS: ["0x123"] };
      const { isLocked } = await LockManager.isLocked();
      expect(isLocked).toBe(false);

      await LockManager.lock();
    });
  });

  // ── Session key backup / restore ───────────────────────────────

  describe("session key backup", () => {
    it("should backup keys to session storage when keys are set", async () => {
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);

      expect(sessionStore["_LM_CACHED_KEYS"]).toEqual(MOCK_KEYS);
    });

    it("should clear session keys on lock", async () => {
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      expect(sessionStore["_LM_CACHED_KEYS"]).toBeDefined();

      await LockManager.lock();

      expect(sessionStore["_LM_CACHED_KEYS"]).toBeUndefined();
    });

    it("should restore keys from session in isLocked()", async () => {
      localStore["KEYSTORES"] = JSON.stringify([{ address: "0x123" }]);
      localStore["ACCOUNTS"] = { ALL_ACCOUNTS: ["0x123"] };
      sessionStore["_LM_CACHED_KEYS"] = MOCK_KEYS;

      const { isLocked } = await LockManager.isLocked();
      expect(isLocked).toBe(false);

      await LockManager.lock();
    });

    it("should NOT restore from session when no keystores exist", async () => {
      // No keystores → clearAllData path → hasPasswordSet = false
      sessionStore["_LM_CACHED_KEYS"] = MOCK_KEYS;

      const { isLocked, hasPasswordSet } = await LockManager.isLocked();
      expect(isLocked).toBe(true);
      expect(hasPasswordSet).toBe(false);
    });
  });

  // ── setupAutoLockAlarm / clearAutoLockAlarm ────────────────────

  describe("setupAutoLockAlarm", () => {
    it("should create an alarm with the configured minutes", async () => {
      localStore["SETTINGS"] = { autoLockMinutes: 5 };

      await LockManager.setupAutoLockAlarm();

      expect(mockAlarms.create).toHaveBeenCalledWith(LockManager.AUTO_LOCK_ALARM, {
        delayInMinutes: 5,
      });
    });

    it("should use default of 15 minutes when not configured", async () => {
      await LockManager.setupAutoLockAlarm();

      expect(mockAlarms.create).toHaveBeenCalledWith(LockManager.AUTO_LOCK_ALARM, {
        delayInMinutes: 15,
      });
    });

    it("should clear alarm when autoLockMinutes is 0 (Never)", async () => {
      localStore["SETTINGS"] = { autoLockMinutes: 0 };

      await LockManager.setupAutoLockAlarm();

      expect(mockAlarms.create).not.toHaveBeenCalled();
      expect(mockAlarms.clear).toHaveBeenCalledWith(LockManager.AUTO_LOCK_ALARM);
    });
  });

  // ── handleAutoLockAlarm ────────────────────────────────────────

  describe("handleAutoLockAlarm", () => {
    it("should lock the wallet, save LOCKED timestamp, and clear session keys", async () => {
      localStore["KEYSTORES"] = JSON.stringify([{ address: "0x123" }]);
      localStore["ACCOUNTS"] = { ALL_ACCOUNTS: ["0x123"] };

      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      await LockManager.startKeepAlive();

      await LockManager.handleAutoLockAlarm();

      const { isLocked } = await LockManager.isLocked();
      expect(isLocked).toBe(true);
      expect(localStore["LOCK_MANAGER_LOCKED_TIMESTAMP"]).toBeDefined();
      // Session keys should be cleared so restore doesn't re-unlock
      expect(sessionStore["_LM_CACHED_KEYS"]).toBeUndefined();
    });
  });

  // ── lock() cleanup ─────────────────────────────────────────────

  describe("lock", () => {
    it("should clear keys, session backup, keep-alive alarm, and auto-lock alarm", async () => {
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      await LockManager.startKeepAlive();
      alarmsStore[LockManager.AUTO_LOCK_ALARM] = { delayInMinutes: 5 };

      await LockManager.lock();

      localStore["KEYSTORES"] = JSON.stringify([{ address: "0x123" }]);
      localStore["ACCOUNTS"] = { ALL_ACCOUNTS: ["0x123"] };
      const { isLocked } = await LockManager.isLocked();
      expect(isLocked).toBe(true);

      expect(mockAlarms.clear).toHaveBeenCalledWith(LockManager.AUTO_LOCK_ALARM);
      expect(mockAlarms.clear).toHaveBeenCalledWith(LockManager.KEEP_ALIVE_ALARM);
      expect(sessionStore["_LM_CACHED_KEYS"]).toBeUndefined();
    });
  });

  // ── lockManagerListener ────────────────────────────────────────

  describe("lockManagerListener", () => {
    it("should start keep-alive and alarm on SET_DECRYPTED_KEYS", async () => {
      localStore["SETTINGS"] = { autoLockMinutes: 10 };

      const result = await LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.SET_DECRYPTED_KEYS,
        data: MOCK_KEYS,
      });

      expect(result).toEqual({ success: true });

      // Keep-alive alarm created
      expect(mockAlarms.create).toHaveBeenCalledWith(
        LockManager.KEEP_ALIVE_ALARM,
        expect.any(Object),
      );
      // Auto-lock alarm created, once
      expect(mockAlarms.create).toHaveBeenCalledWith(LockManager.AUTO_LOCK_ALARM, {
        delayInMinutes: 10,
      });
      expect(
        mockAlarms.create.mock.calls.filter(
          (call: any) => call[0] === LockManager.AUTO_LOCK_ALARM,
        ),
      ).toHaveLength(1);
      // Keys backed up to session
      expect(sessionStore["_LM_CACHED_KEYS"]).toEqual(MOCK_KEYS);

      await LockManager.lock();
    });

    it("should handle UPDATE_AUTO_LOCK by recreating alarm", async () => {
      localStore["SETTINGS"] = { autoLockMinutes: 30 };

      const result = await LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.UPDATE_AUTO_LOCK,
        data: undefined,
      });

      expect(result).toEqual({ success: true });
      expect(mockAlarms.create).toHaveBeenCalledWith(LockManager.AUTO_LOCK_ALARM, {
        delayInMinutes: 30,
      });
    });

    it("should reset auto-lock timer on an activity message (USER_ACTIVITY) while unlocked", async () => {
      localStore["SETTINGS"] = { autoLockMinutes: 5 };
      localStore["KEYSTORES"] = JSON.stringify([{ address: "0x123" }]);
      localStore["ACCOUNTS"] = { ALL_ACCOUNTS: ["0x123"] };

      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      mockAlarms.create.mockClear();

      await LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.USER_ACTIVITY,
        data: undefined,
      });

      expect(mockAlarms.create).toHaveBeenCalledWith(LockManager.AUTO_LOCK_ALARM, {
        delayInMinutes: 5,
      });

      await LockManager.lock();
    });

    it("should reset auto-lock timer on a dApp approval/rejection response (keyed by `action`) while unlocked", async () => {
      localStore["SETTINGS"] = { autoLockMinutes: 5 };
      localStore["KEYSTORES"] = JSON.stringify([{ address: "0x123" }]);
      localStore["ACCOUNTS"] = { ALL_ACCOUNTS: ["0x123"] };

      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      mockAlarms.create.mockClear();

      await LockManager.lockManagerListener({
        action: "QRL_WALLET_DAPP_RESPONSE",
        data: undefined,
      });

      expect(mockAlarms.create).toHaveBeenCalledWith(LockManager.AUTO_LOCK_ALARM, {
        delayInMinutes: 5,
      });

      await LockManager.lock();
    });

    it("should reset auto-lock timer on activity that arrives before the first lock-state read after a restart", async () => {
      localStore["SETTINGS"] = { autoLockMinutes: 5 };
      localStore["KEYSTORES"] = JSON.stringify([{ address: "0x123" }]);
      localStore["ACCOUNTS"] = { ALL_ACCOUNTS: ["0x123"] };
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      // The worker restarts. Its keys are in the session copy, and nothing
      // has asked for the lock state yet.
      restartWorker();
      mockAlarms.create.mockClear();

      await LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.USER_ACTIVITY,
        data: undefined,
      });

      expect(mockAlarms.create).toHaveBeenCalledWith(LockManager.AUTO_LOCK_ALARM, {
        delayInMinutes: 5,
      });
      expect(LockManager.getDecryptedKeys()).toEqual(MOCK_KEYS);

      await LockManager.lock();
    });

    it("should NOT reset auto-lock timer on a read (IS_LOCKED) while unlocked", async () => {
      localStore["SETTINGS"] = { autoLockMinutes: 5 };
      localStore["KEYSTORES"] = JSON.stringify([{ address: "0x123" }]);
      localStore["ACCOUNTS"] = { ALL_ACCOUNTS: ["0x123"] };

      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      mockAlarms.create.mockClear();

      await LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.IS_LOCKED,
        data: undefined,
      });

      expect(mockAlarms.create).not.toHaveBeenCalled();

      await LockManager.lock();
    });

    it("should NOT reset auto-lock timer when wallet is locked", async () => {
      localStore["SETTINGS"] = { autoLockMinutes: 5 };

      mockAlarms.create.mockClear();

      await LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.IS_LOCKED,
        data: undefined,
      });

      expect(mockAlarms.create).not.toHaveBeenCalled();
    });

    it("should lock wallet on LOCK message", async () => {
      localStore["KEYSTORES"] = JSON.stringify([{ address: "0x123" }]);
      localStore["ACCOUNTS"] = { ALL_ACCOUNTS: ["0x123"] };
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);

      await LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.LOCK,
        data: undefined,
      });

      const { isLocked } = await LockManager.isLocked();
      expect(isLocked).toBe(true);
      // Session keys cleared — no restore after intentional lock
      expect(sessionStore["_LM_CACHED_KEYS"]).toBeUndefined();
    });
  });

  // ── getWalletPassword / encryptAccount (empty-password guard) ──

  describe("getWalletPassword", () => {
    it("should return the password after a normal unlock", async () => {
      await LockManager.setDecryptedKeysFromPopup({
        keys: MOCK_KEYS,
        walletPassword: "correct horse battery staple",
      });

      expect(LockManager.getWalletPassword()).toBe(
        "correct horse battery staple",
      );

      await LockManager.lock();
    });

    it("should throw when the decrypted keys self-healed from session storage but the password did not", async () => {
      // Simulate a service-worker restart: the popup offers only the
      // bare keys array (its SW-restart path), so decryptedKeys is
      // populated but walletPassword stays unset.
      expect(await LockManager.restoreKeysFromPopup(MOCK_KEYS)).toBe(true);

      expect(() => LockManager.getWalletPassword()).toThrow(
        "QRL Web3 Wallet password is unavailable",
      );

      await LockManager.lock();
    });
  });

  describe("isLocked while the first keystore is being stored", () => {
    it("keeps the session of an account stored during its storage read", async () => {
      // First start: no keystore yet, the account list is already written.
      localStore["ACCOUNTS"] = { ALL_ACCOUNTS: ["Q20B714091cF2a62DADda2847803e3f1B9D2D3779"] };
      mockEncrypt.mockResolvedValueOnce({
        address: "Q20B714091cF2a62DADda2847803e3f1B9D2D3779",
      });

      // A lock-state read that has seen "no keystores" and now waits for the
      // account list.
      let releaseAccounts: () => void = () => undefined;
      const accountsRead = new Promise<void>((resolve) => {
        releaseAccounts = resolve;
      });
      const original = StorageUtil.getAllAccounts.bind(StorageUtil);
      const spy = vi
        .spyOn(StorageUtil, "getAllAccounts")
        .mockImplementationOnce(async () => {
          await accountsRead;
          return original();
        });
      const staleRead = LockManager.isLocked();

      // Meanwhile the first account is stored and the session gets its
      // password.
      await LockManager.encryptAccount({
        seed: "" as any,
        password: "correct horse battery staple",
      });
      expect(LockManager.getWalletPassword()).toBe(
        "correct horse battery staple",
      );

      releaseAccounts();
      expect(await staleRead).toEqual({ isLocked: false, hasPasswordSet: true });
      expect(LockManager.getWalletPassword()).toBe(
        "correct horse battery staple",
      );
      spy.mockRestore();
      await LockManager.lock();
    });

    it("keeps the session while the account list of a new wallet has not arrived", async () => {
      // The popup writes the account list on its own; the keystore of the
      // first account can be stored before it.
      mockEncrypt.mockResolvedValueOnce({
        address: "Q20B714091cF2a62DADda2847803e3f1B9D2D3779",
      });
      await LockManager.encryptAccount({
        seed: "" as any,
        password: "correct horse battery staple",
      });

      expect(await LockManager.isLocked()).toEqual({
        isLocked: false,
        hasPasswordSet: false,
      });
      expect(LockManager.getWalletPassword()).toBe(
        "correct horse battery staple",
      );
      await LockManager.lock();
    });

    it("drops the session of keystores without an account list when this worker stored none of them", async () => {
      localStore["KEYSTORES"] = JSON.stringify([{ address: "0x123" }]);
      await LockManager.setDecryptedKeysFromPopup({
        keys: MOCK_KEYS,
        walletPassword: "correct horse battery staple",
      });
      expect(await LockManager.isLocked()).toEqual({
        isLocked: true,
        hasPasswordSet: false,
      });
      expect(() => LockManager.getWalletPassword()).toThrow();
    });

    it("still drops the session when storage really holds no wallet", async () => {
      await LockManager.setDecryptedKeysFromPopup({
        keys: MOCK_KEYS,
        walletPassword: "correct horse battery staple",
      });
      expect(await LockManager.isLocked()).toEqual({
        isLocked: true,
        hasPasswordSet: false,
      });
      expect(() => LockManager.getWalletPassword()).toThrow();
    });
  });

  describe("encryptAccount", () => {
    it("should refuse an empty password and persist no keystore", async () => {
      await expect(
        LockManager.encryptAccount({ seed: "" as any, password: "" }),
      ).rejects.toThrow(
        "Refusing to encrypt an account without a password",
      );

      expect(mockEncrypt).not.toHaveBeenCalled();
      expect(localStore["KEYSTORES"]).toBeUndefined();
    });

    it("keeps a keystore that was stored while another account was being encrypted", async () => {
      let finishFirst: (keystore: { address: string }) => void = () =>
        undefined;
      mockEncrypt
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishFirst = resolve;
            }),
        )
        .mockResolvedValueOnce({ address: "Qbbb" });

      const first = LockManager.encryptAccount({
        seed: "" as any,
        password: "correct horse battery staple",
      });
      await LockManager.encryptAccount({
        seed: "" as any,
        password: "correct horse battery staple",
      });
      finishFirst({ address: "Qaaa" });
      await first;

      const stored: { address: string }[] = JSON.parse(localStore["KEYSTORES"]);
      expect(stored.map((keystore) => keystore.address)).toEqual([
        "Qbbb",
        "Qaaa",
      ]);
      await LockManager.lock();
    });

    it("should encrypt and persist the keystore with a non-empty password", async () => {
      mockEncrypt.mockResolvedValueOnce({
        address: "Q20B714091cF2a62DADda2847803e3f1B9D2D3779",
      });

      await LockManager.encryptAccount({
        seed: "" as any,
        password: "correct horse battery staple",
      });

      expect(mockEncrypt).toHaveBeenCalledWith(
        "",
        "correct horse battery staple",
      );
      expect(localStore["KEYSTORES"]).toBeDefined();

      await LockManager.lock();
    });
  });

  // ── Lock and restore lifecycle ─────────────────────────────────

  describe("lock and restore lifecycle", () => {
    const SESSION_COPY = "_LM_CACHED_KEYS";
    const mockSession = browser.storage.session as any;
    const mockLocal = browser.storage.local as any;

    // A storage call that waits until the test lets it go on.
    const held = () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { gate, release };
    };

    // Lets the calls that are already under way reach their next storage call.
    const settle = async () => {
      for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    };

    // The same for a call with several storage reads before the one that
    // is held.
    const reach = async () => {
      for (let step = 0; step < 6; step++) await settle();
    };

    const storeWallet = () => {
      localStore["KEYSTORES"] = JSON.stringify([{ address: "0x123" }]);
      localStore["ACCOUNTS"] = { ALL_ACCOUNTS: ["0x123"] };
    };

    // Each timestamp is later than the one before, as it is between a lock
    // and an unlock by hand.
    beforeEach(() => {
      let now = 1_800_000_000_000;
      vi.spyOn(Date, "now").mockImplementation(() => (now += 1000));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("keeps the wallet locked when a lock arrives during a restore from the session copy", async () => {
      storeWallet();
      sessionStore[SESSION_COPY] = MOCK_KEYS;
      // The restore reads the copy before the lock removes it, and the read
      // answers after the lock has cleared memory.
      const read = held();
      mockSession.get.mockImplementationOnce(async (key: string) => {
        const seen = { [key]: sessionStore[key] };
        await read.gate;
        return seen;
      });

      const restoring = LockManager.isLocked();
      await settle();
      const locking = LockManager.lock();
      read.release();
      await locking;

      expect(await restoring).toEqual({ isLocked: true, hasPasswordSet: true });
      expect(() => LockManager.getDecryptedKeys()).toThrow(
        "QRL Web3 Wallet is locked",
      );
      expect(sessionStore[SESSION_COPY]).toBeUndefined();
    });

    it("removes the session copy when a lock arrives while the keys are still being written to it", async () => {
      const write = held();
      mockSession.set.mockImplementationOnce(
        async (data: Record<string, unknown>) => {
          await write.gate;
          Object.assign(sessionStore, data);
        },
      );

      const unlocking = LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      await settle();
      const locking = LockManager.lock();
      write.release();
      await Promise.all([unlocking, locking]);

      expect(sessionStore[SESSION_COPY]).toBeUndefined();
      expect(() => LockManager.getDecryptedKeys()).toThrow(
        "QRL Web3 Wallet is locked",
      );
    });

    it("writes no session copy for keys whose session a lock ended before the write began", async () => {
      storeWallet();
      // The queue is busy with a read, so the copy of the keys waits behind it.
      const read = held();
      mockSession.get.mockImplementationOnce(async () => {
        await read.gate;
        return {};
      });
      const restoring = LockManager.isLocked();
      await settle();

      const unlocking = LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      await settle();
      const locking = LockManager.lock();
      read.release();
      await Promise.all([restoring, unlocking, locking]);

      expect(mockSession.set).not.toHaveBeenCalledWith(
        expect.objectContaining({ [SESSION_COPY]: expect.anything() }),
      );
      expect(sessionStore[SESSION_COPY]).toBeUndefined();
      expect(() => LockManager.getDecryptedKeys()).toThrow(
        "QRL Web3 Wallet is locked",
      );
    });

    it("keeps the keys and the session copy of an unlock that follows a lock still at work", async () => {
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      const removal = held();
      mockSession.remove.mockImplementationOnce(async (key: string) => {
        await removal.gate;
        delete sessionStore[key];
      });

      const locking = LockManager.lock();
      await settle();
      const unlocking = LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      await settle();
      removal.release();
      await Promise.all([locking, unlocking]);

      expect(LockManager.getDecryptedKeys()).toEqual(MOCK_KEYS);
      expect(sessionStore[SESSION_COPY]).toEqual(MOCK_KEYS);
    });

    it("clears the keys and runs every other step when the LOCKED timestamp cannot be written", async () => {
      await LockManager.setDecryptedKeysFromPopup({
        keys: MOCK_KEYS,
        walletPassword: "correct horse battery staple",
      });
      await LockManager.startKeepAlive();
      alarmsStore[LockManager.AUTO_LOCK_ALARM] = { delayInMinutes: 5 };
      mockLocal.set.mockRejectedValueOnce(new Error("storage failed"));

      await expect(LockManager.lock()).rejects.toThrow(
        "The wallet is locked, but a cleanup step failed: the LOCKED timestamp",
      );

      expect(() => LockManager.getDecryptedKeys()).toThrow(
        "QRL Web3 Wallet is locked",
      );
      expect(() => LockManager.getWalletPassword()).toThrow();
      expect(sessionStore[SESSION_COPY]).toBeUndefined();
      expect(alarmsStore[LockManager.KEEP_ALIVE_ALARM]).toBeUndefined();
      expect(alarmsStore[LockManager.AUTO_LOCK_ALARM]).toBeUndefined();
    });

    it("stays locked, in this worker and in the next, when the session copy cannot be removed", async () => {
      storeWallet();
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      await LockManager.startKeepAlive();
      mockSession.remove.mockRejectedValueOnce(new Error("storage failed"));

      await expect(LockManager.lock()).rejects.toThrow(
        "The wallet is locked, but a cleanup step failed: the session copy of the keys",
      );

      // The copy is still there, and every other step ran.
      expect(sessionStore[SESSION_COPY]).toEqual(MOCK_KEYS);
      expect(localStore["LOCK_MANAGER_LOCKED_TIMESTAMP"]).toBeDefined();
      expect(alarmsStore[LockManager.KEEP_ALIVE_ALARM]).toBeUndefined();
      // The worker that locked the wallet does not restore it.
      expect(await LockManager.isLocked()).toEqual({
        isLocked: true,
        hasPasswordSet: true,
      });
      await LockManager.handleKeepAliveAlarm();
      expect(() => LockManager.getDecryptedKeys()).toThrow();

      // A worker that starts later reads the timestamps, leaves the wallet
      // locked and removes the copy.
      restartWorker();
      expect(await LockManager.isLocked()).toEqual({
        isLocked: true,
        hasPasswordSet: true,
      });
      expect(sessionStore[SESSION_COPY]).toBeUndefined();
    });

    it("stays locked in the worker that locked it when neither the LOCKED timestamp nor the removal of the session copy went through", async () => {
      storeWallet();
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      mockLocal.set.mockRejectedValueOnce(new Error("storage failed"));
      mockSession.remove.mockRejectedValueOnce(new Error("storage failed"));

      await expect(LockManager.lock()).rejects.toThrow(
        "The wallet is locked, but a cleanup step failed: the LOCKED timestamp, the session copy of the keys",
      );

      // Storage reads as an unlocked session now: the copy is there, and no
      // LOCKED timestamp says otherwise. This worker knows better.
      expect(sessionStore[SESSION_COPY]).toEqual(MOCK_KEYS);
      expect(localStore["LOCK_MANAGER_LOCKED_TIMESTAMP"]).toBeUndefined();
      expect(await LockManager.isLocked()).toEqual({
        isLocked: true,
        hasPasswordSet: true,
      });
      await LockManager.handleKeepAliveAlarm();
      expect(() => LockManager.getDecryptedKeys()).toThrow(
        "QRL Web3 Wallet is locked",
      );
      // The same for the keys a window still holds.
      expect(
        await LockManager.lockManagerListener({
          name: LOCK_MANAGER_MESSAGES.RESTORE_DECRYPTED_KEYS,
          data: MOCK_KEYS,
        }),
      ).toEqual({ success: false });
      expect(() => LockManager.getDecryptedKeys()).toThrow(
        "QRL Web3 Wallet is locked",
      );
    });

    it("keeps the wallet locked when a lock arrives while a restore reads the timestamps and the LOCKED timestamp cannot be written", async () => {
      storeWallet();
      sessionStore[SESSION_COPY] = MOCK_KEYS;
      // The restore has read the copy and waits for the second timestamp.
      // Both will say the wallet is unlocked: the lock's own LOCKED write
      // fails, so nothing but the ended session tells the restore.
      const read = held();
      vi.spyOn(StorageUtil, "getLockStateTimeStamp")
        .mockImplementationOnce(async () => 1000)
        .mockImplementationOnce(async () => {
          await read.gate;
          return 2000;
        });

      const restoring = LockManager.isLocked();
      await reach();
      mockLocal.set.mockRejectedValueOnce(new Error("storage failed"));
      await expect(LockManager.lock()).rejects.toThrow(
        "The wallet is locked, but a cleanup step failed: the LOCKED timestamp",
      );
      read.release();

      expect(await restoring).toEqual({ isLocked: true, hasPasswordSet: true });
      expect(() => LockManager.getDecryptedKeys()).toThrow(
        "QRL Web3 Wallet is locked",
      );
    });

    it("refuses a window's keys when a lock arrives while the offer waits for the timestamps and the LOCKED timestamp cannot be written", async () => {
      storeWallet();
      const read = held();
      vi.spyOn(StorageUtil, "getLockStateTimeStamp")
        .mockImplementationOnce(async () => 1000)
        .mockImplementationOnce(async () => {
          await read.gate;
          return 2000;
        });

      const offering = LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.RESTORE_DECRYPTED_KEYS,
        data: MOCK_KEYS,
      });
      await reach();
      mockLocal.set.mockRejectedValueOnce(new Error("storage failed"));
      await expect(LockManager.lock()).rejects.toThrow(
        "The wallet is locked, but a cleanup step failed: the LOCKED timestamp",
      );
      read.release();

      expect(await offering).toEqual({ success: false });
      expect(() => LockManager.getDecryptedKeys()).toThrow(
        "QRL Web3 Wallet is locked",
      );
      expect(sessionStore[SESSION_COPY]).toBeUndefined();
      expect(alarmsStore[LockManager.KEEP_ALIVE_ALARM]).toBeUndefined();
    });

    it("refuses a window's keys, and starts no alarm, when a lock arrives while they are being written to the session copy", async () => {
      storeWallet();
      localStore["LOCK_MANAGER_UNLOCKED_TIMESTAMP"] = 2000;
      localStore["LOCK_MANAGER_LOCKED_TIMESTAMP"] = 1000;
      const write = held();
      mockSession.set.mockImplementationOnce(
        async (data: Record<string, unknown>) => {
          await write.gate;
          Object.assign(sessionStore, data);
        },
      );

      const offering = LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.RESTORE_DECRYPTED_KEYS,
        data: MOCK_KEYS,
      });
      await reach();
      expect(mockSession.set).toHaveBeenCalledTimes(1);
      const locking = LockManager.lock();
      write.release();
      await locking;

      expect(await offering).toEqual({ success: false });
      expect(() => LockManager.getDecryptedKeys()).toThrow(
        "QRL Web3 Wallet is locked",
      );
      expect(sessionStore[SESSION_COPY]).toBeUndefined();
      expect(alarmsStore[LockManager.KEEP_ALIVE_ALARM]).toBeUndefined();
      expect(alarmsStore[LockManager.AUTO_LOCK_ALARM]).toBeUndefined();
    });

    it("reads a lock in the same millisecond as the unlock as a lock", async () => {
      storeWallet();
      sessionStore[SESSION_COPY] = MOCK_KEYS;
      localStore["LOCK_MANAGER_UNLOCKED_TIMESTAMP"] = 5000;
      localStore["LOCK_MANAGER_LOCKED_TIMESTAMP"] = 5000;

      expect(await LockManager.isLocked()).toEqual({
        isLocked: true,
        hasPasswordSet: true,
      });
      expect(sessionStore[SESSION_COPY]).toBeUndefined();
    });

    it("lets a session go on in a worker that locked the wallet and has unlocked it since", async () => {
      storeWallet();
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      await LockManager.lock();
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);

      expect(
        await LockManager.lockManagerListener({
          name: LOCK_MANAGER_MESSAGES.RESTORE_DECRYPTED_KEYS,
          data: MOCK_KEYS,
        }),
      ).toEqual({ success: true });
      expect(LockManager.getDecryptedKeys()).toEqual(MOCK_KEYS);
    });

    it("restores an unlocked session in a worker that starts later", async () => {
      storeWallet();
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      await LockManager.lock();
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);

      restartWorker();

      expect(await LockManager.isLocked()).toEqual({
        isLocked: false,
        hasPasswordSet: true,
      });
      expect(LockManager.getDecryptedKeys()).toEqual(MOCK_KEYS);
    });

    it("writes the UNLOCKED timestamp when a session starts, and once", async () => {
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      const startedAt = localStore["LOCK_MANAGER_UNLOCKED_TIMESTAMP"];
      expect(startedAt).toBeDefined();

      // New keys for a wallet that is unlocked already, as a password change
      // sends them.
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);

      expect(localStore["LOCK_MANAGER_UNLOCKED_TIMESTAMP"]).toBe(startedAt);
    });

    it("refuses the keys a window still holds once this worker has locked the wallet", async () => {
      storeWallet();
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      await LockManager.lock();
      mockAlarms.create.mockClear();

      const answer = await LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.RESTORE_DECRYPTED_KEYS,
        data: { keys: MOCK_KEYS, walletPassword: "correct horse battery staple" },
      });

      expect(answer).toEqual({ success: false });
      expect(await LockManager.isLocked()).toEqual({
        isLocked: true,
        hasPasswordSet: true,
      });
      expect(() => LockManager.getWalletPassword()).toThrow();
      expect(sessionStore[SESSION_COPY]).toBeUndefined();
      expect(mockAlarms.create).not.toHaveBeenCalled();
    });

    it("refuses the keys a window still holds in a worker that started after the lock", async () => {
      storeWallet();
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      await LockManager.lock();
      restartWorker();

      const answer = await LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.RESTORE_DECRYPTED_KEYS,
        data: { keys: MOCK_KEYS, walletPassword: "correct horse battery staple" },
      });

      expect(answer).toEqual({ success: false });
      expect(await LockManager.isLocked()).toEqual({
        isLocked: true,
        hasPasswordSet: true,
      });
      expect(sessionStore[SESSION_COPY]).toBeUndefined();
    });

    it("keeps the keys it holds when a window offers an older copy, and takes no password from it", async () => {
      storeWallet();
      const withNewAccount: DecryptedKeyType[] = [
        ...MOCK_KEYS,
        { address: "Qadded", seed: "0x02", mnemonicPhrases: "mocked mnemonic" },
      ];
      await LockManager.setDecryptedKeysFromPopup(withNewAccount);
      // The worker restarts and restores its keys from the session copy.
      // Its password is gone.
      restartWorker();
      expect((await LockManager.isLocked()).isLocked).toBe(false);
      expect(() => LockManager.getWalletPassword()).toThrow(
        "QRL Web3 Wallet password is unavailable",
      );

      // A window that unlocked before the account was added offers its copy.
      const answer = await LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.RESTORE_DECRYPTED_KEYS,
        data: { keys: MOCK_KEYS, walletPassword: "correct horse battery staple" },
      });

      expect(answer).toEqual({ success: true });
      expect(LockManager.getDecryptedKeys()).toEqual(withNewAccount);
      expect(() => LockManager.getWalletPassword()).toThrow(
        "QRL Web3 Wallet password is unavailable",
      );
      expect(sessionStore[SESSION_COPY]).toEqual(withNewAccount);
    });

    it("restores its own session copy before it looks at a window's older copy", async () => {
      storeWallet();
      const withNewAccount: DecryptedKeyType[] = [
        ...MOCK_KEYS,
        { address: "Qadded", seed: "0x02", mnemonicPhrases: "mocked mnemonic" },
      ];
      await LockManager.setDecryptedKeysFromPopup(withNewAccount);
      // The worker restarts. Nothing has read the lock state yet, so its
      // memory is empty and the session copy holds the three keys.
      restartWorker();

      const answer = await LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.RESTORE_DECRYPTED_KEYS,
        data: MOCK_KEYS,
      });

      expect(answer).toEqual({ success: true });
      expect(LockManager.getDecryptedKeys()).toEqual(withNewAccount);
      expect(sessionStore[SESSION_COPY]).toEqual(withNewAccount);
    });

    it("refuses an offer without keys", async () => {
      storeWallet();

      for (const data of [[], { keys: [], walletPassword: "pw" }, undefined]) {
        const answer = await LockManager.lockManagerListener({
          name: LOCK_MANAGER_MESSAGES.RESTORE_DECRYPTED_KEYS,
          data,
        });
        expect(answer).toEqual({ success: false });
      }

      expect(await LockManager.isLocked()).toEqual({
        isLocked: true,
        hasPasswordSet: true,
      });
      expect(alarmsStore[LockManager.KEEP_ALIVE_ALARM]).toBeUndefined();
    });

    it("leaves the session copy of an unlock that arrives while a restore has read the wallet as locked", async () => {
      storeWallet();
      // A copy that a failed removal left behind, and timestamps that say
      // locked. The restore waits at its second timestamp read.
      sessionStore[SESSION_COPY] = MOCK_KEYS;
      const afterUnlock: DecryptedKeyType[] = [
        ...MOCK_KEYS,
        { address: "Qadded", seed: "0x02", mnemonicPhrases: "mocked mnemonic" },
      ];
      const read = held();
      vi.spyOn(StorageUtil, "getLockStateTimeStamp")
        .mockImplementationOnce(async () => 2000)
        .mockImplementationOnce(async () => {
          await read.gate;
          return 1000;
        });

      const restoring = LockManager.isLocked();
      await settle();
      await LockManager.setDecryptedKeysFromPopup(afterUnlock);
      read.release();
      await restoring;

      expect(LockManager.getDecryptedKeys()).toEqual(afterUnlock);
      expect(sessionStore[SESSION_COPY]).toEqual(afterUnlock);
    });

    it("keeps the keys of an unlock that arrives during a restore from the session copy", async () => {
      storeWallet();
      sessionStore[SESSION_COPY] = MOCK_KEYS;
      const afterUnlock: DecryptedKeyType[] = [
        ...MOCK_KEYS,
        { address: "Qadded", seed: "0x02", mnemonicPhrases: "mocked mnemonic" },
      ];
      const read = held();
      mockSession.get.mockImplementationOnce(async (key: string) => {
        const seen = { [key]: sessionStore[key] };
        await read.gate;
        return seen;
      });

      const restoring = LockManager.isLocked();
      await settle();
      const unlocking = LockManager.setDecryptedKeysFromPopup(afterUnlock);
      await settle();
      read.release();
      await Promise.all([restoring, unlocking]);

      expect(LockManager.getDecryptedKeys()).toEqual(afterUnlock);
      expect(sessionStore[SESSION_COPY]).toEqual(afterUnlock);
    });

    it("takes the keys a window still holds in a worker that restarted, without postponing the auto-lock", async () => {
      storeWallet();
      alarmsStore[LockManager.AUTO_LOCK_ALARM] = { delayInMinutes: 5 };

      const answer = await LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.RESTORE_DECRYPTED_KEYS,
        data: { keys: MOCK_KEYS, walletPassword: "correct horse battery staple" },
      });

      expect(answer).toEqual({ success: true });
      expect(LockManager.getDecryptedKeys()).toEqual(MOCK_KEYS);
      // The window's password is not taken: this worker cannot check it.
      expect(() => LockManager.getWalletPassword()).toThrow(
        "QRL Web3 Wallet password is unavailable",
      );
      expect(sessionStore[SESSION_COPY]).toEqual(MOCK_KEYS);
      expect(mockAlarms.create).toHaveBeenCalledWith(
        LockManager.KEEP_ALIVE_ALARM,
        expect.any(Object),
      );
      // The running auto-lock alarm is left as it is.
      expect(mockAlarms.create).not.toHaveBeenCalledWith(
        LockManager.AUTO_LOCK_ALARM,
        expect.any(Object),
      );
    });

    it("sets the auto-lock alarm for keys a window still holds when none is running", async () => {
      storeWallet();
      localStore["SETTINGS"] = { autoLockMinutes: 5 };

      await LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.RESTORE_DECRYPTED_KEYS,
        data: MOCK_KEYS,
      });

      expect(mockAlarms.create).toHaveBeenCalledWith(
        LockManager.AUTO_LOCK_ALARM,
        { delayInMinutes: 5 },
      );
    });

    it("stores a new account and stays locked when a lock arrives while the account is being encrypted", async () => {
      await LockManager.setDecryptedKeysFromPopup({
        keys: MOCK_KEYS,
        walletPassword: "correct horse battery staple",
      });
      let finish: (keystore: { address: string }) => void = () => undefined;
      mockEncrypt.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );

      const adding = LockManager.encryptAccount({
        seed: "" as any,
        password: "correct horse battery staple",
      });
      await settle();
      await LockManager.lock();
      finish({ address: "Qnew" });
      await adding;

      const stored: { address: string }[] = JSON.parse(localStore["KEYSTORES"]);
      expect(stored.map((keystore) => keystore.address)).toEqual(["Qnew"]);
      expect(() => LockManager.getDecryptedKeys()).toThrow(
        "QRL Web3 Wallet is locked",
      );
      expect(() => LockManager.getWalletPassword()).toThrow();
      // The password the account came with is not kept for a locked wallet.
      expect(Reflect.get(LockManager, "walletPassword")).toBeUndefined();
      expect(sessionStore[SESSION_COPY]).toBeUndefined();
    });

    it("starts no alarm for an unlock whose session a lock ended meanwhile", async () => {
      storeWallet();
      // The unlock waits at its UNLOCKED timestamp while the lock runs.
      const stamp = held();
      mockLocal.set.mockImplementationOnce(
        async (data: Record<string, unknown>) => {
          await stamp.gate;
          Object.assign(localStore, data);
        },
      );

      const unlocking = LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.SET_DECRYPTED_KEYS,
        data: MOCK_KEYS,
      });
      await settle();
      await LockManager.lock();
      stamp.release();
      await unlocking;

      expect(alarmsStore[LockManager.KEEP_ALIVE_ALARM]).toBeUndefined();
      expect(alarmsStore[LockManager.AUTO_LOCK_ALARM]).toBeUndefined();
      expect(sessionStore[SESSION_COPY]).toBeUndefined();
      expect(await LockManager.isLocked()).toEqual({
        isLocked: true,
        hasPasswordSet: true,
      });
    });

    it("locks on the auto-lock alarm even when a cleanup step fails", async () => {
      storeWallet();
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      mockSession.remove.mockRejectedValueOnce(new Error("storage failed"));
      const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);

      await expect(LockManager.handleAutoLockAlarm()).resolves.toBeUndefined();

      expect(reported).toHaveBeenCalled();
      expect(() => LockManager.getDecryptedKeys()).toThrow(
        "QRL Web3 Wallet is locked",
      );
      expect(localStore["LOCK_MANAGER_LOCKED_TIMESTAMP"]).toBeDefined();
    });
  });

  // ── Constants ──────────────────────────────────────────────────

  describe("AUTO_LOCK_ALARM", () => {
    it("should be publicly accessible", () => {
      expect(LockManager.AUTO_LOCK_ALARM).toBe("QRL_AUTO_LOCK");
    });
  });

  describe("KEEP_ALIVE_ALARM", () => {
    it("should be publicly accessible", () => {
      expect(LockManager.KEEP_ALIVE_ALARM).toBe("QRL_KEEP_ALIVE");
    });
  });

  describe("LOCK_MANAGER_MESSAGES", () => {
    it("should include UPDATE_AUTO_LOCK", () => {
      expect(LOCK_MANAGER_MESSAGES.UPDATE_AUTO_LOCK).toBe(
        "LOCK_MANAGER_UPDATE_AUTO_LOCK",
      );
    });
  });
});
