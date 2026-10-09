import { beforeEach, describe, expect, it, vi } from "vitest";

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
import LockManager, { LOCK_MANAGER_MESSAGES } from "./lockManager";
import type { DecryptedKeyType } from "./lockManager";

const mockAlarms = browser.alarms as any;

const clearStore = (store: Record<string, any>) => {
  for (const k of Object.keys(store)) delete store[k];
};

const MOCK_KEYS: DecryptedKeyType[] = [
  {
    password: "test123",
    address: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
    seed: "0x010000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    mnemonicPhrases: "mocked mnemonic",
  },
];

describe("LockManager – keep-alive & auto-lock", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearStore(localStore);
    clearStore(sessionStore);
    clearStore(alarmsStore);
    await LockManager.lock();
  });

  // ── startKeepAlive / stopKeepAlive (periodic alarm) ────────────

  describe("startKeepAlive", () => {
    it("should create a periodic alarm", async () => {
      await LockManager.startKeepAlive();

      expect(mockAlarms.create).toHaveBeenCalledWith(LockManager.KEEP_ALIVE_ALARM, {
        periodInMinutes: 0.5,
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

  // ── Session op ordering (sessionOpQueue) ────────────────────────

  describe("session op ordering", () => {
    it("should write the LOCKED timestamp before clearing decrypted keys", async () => {
      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);

      await LockManager.lock();

      expect(localStore["LOCK_MANAGER_LOCKED_TIMESTAMP"]).toBeDefined();
    });

    it("should queue lock()'s session clear behind a still-in-flight key backup write, and not let it resurrect keys", async () => {
      const mockSessionSet = browser.storage.session.set as any;
      let releaseSlowWrite!: () => void;
      const slowWrite = new Promise<void>((resolve) => {
        releaseSlowWrite = resolve;
      });
      // The next backupKeysToSession() write takes a while to actually
      // land in storage.
      mockSessionSet.mockImplementationOnce((data: Record<string, any>) =>
        slowWrite.then(() => {
          Object.assign(sessionStore, data);
        }),
      );

      // Start the slow write, then lock before it lands.
      const slowSetPromise = LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      let lockSettled = false;
      const lockPromise = LockManager.lock().then(() => {
        lockSettled = true;
      });

      // Drain every pending microtask via a macrotask boundary, without
      // releasing the slow write. lock()'s own session-storage clear goes
      // through the same sessionOpQueue as the write above, so it cannot
      // run until the write's own turn finishes: lock() must still be
      // pending here. (Without that queue, lock() has nothing left to
      // wait on and would have long since settled by this point.)
      await new Promise((r) => setTimeout(r, 0));
      expect(lockSettled).toBe(false);

      // Let the slow write land, and let both operations finish.
      releaseSlowWrite();
      await slowSetPromise;
      await lockPromise;

      expect(lockSettled).toBe(true);
      // The clear ran after the write's turn, so it is the clear that
      // sticks: the wallet does not read as unlocked again on the next
      // service-worker restart.
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
      // Auto-lock alarm created
      expect(mockAlarms.create).toHaveBeenCalledWith(LockManager.AUTO_LOCK_ALARM, {
        delayInMinutes: 10,
      });
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

    it("should reset auto-lock timer on any message while unlocked", async () => {
      localStore["SETTINGS"] = { autoLockMinutes: 5 };
      localStore["KEYSTORES"] = JSON.stringify([{ address: "0x123" }]);
      localStore["ACCOUNTS"] = { ALL_ACCOUNTS: ["0x123"] };

      await LockManager.setDecryptedKeysFromPopup(MOCK_KEYS);
      mockAlarms.create.mockClear();

      await LockManager.lockManagerListener({
        name: LOCK_MANAGER_MESSAGES.IS_LOCKED,
        data: undefined,
      });

      expect(mockAlarms.create).toHaveBeenCalledWith(LockManager.AUTO_LOCK_ALARM, {
        delayInMinutes: 5,
      });

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
