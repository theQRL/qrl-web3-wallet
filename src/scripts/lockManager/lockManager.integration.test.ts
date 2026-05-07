/**
 * Integration / scenario tests for auto-lock + keep-alive.
 *
 * These tests simulate the full lifecycle of the lock manager:
 *   unlock → keep-alive ticks → activity resets → alarm fires → wallet locks
 *
 * The Chrome Alarms API is simulated with a scheduler that fires alarm
 * callbacks when Jest's fake clock advances past the scheduled time.
 * This lets us "fast-forward" 15, 30, or 60 real minutes in milliseconds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Stores (must be prefixed with "mock" for vi.mock hoisting) ────
const mockLocalStore: Record<string, any> = {};
const mockSessionStore: Record<string, any> = {};

// ── Alarm simulator ────────────────────────────────────────────────
type MockPendingAlarm = { name: string; scheduledTime: number };
let mockPendingAlarms: MockPendingAlarm[] = [];

vi.mock("webextension-polyfill", () => ({
  __esModule: true,
  default: {
    storage: {
      local: {
        get: vi.fn((key: string) =>
          Promise.resolve(
            key in mockLocalStore ? { [key]: mockLocalStore[key] } : {},
          ),
        ),
        set: vi.fn((data: Record<string, any>) => {
          Object.assign(mockLocalStore, data);
          return Promise.resolve();
        }),
        remove: vi.fn((key: string) => {
          delete mockLocalStore[key];
          return Promise.resolve();
        }),
        clear: vi.fn(() => {
          for (const k of Object.keys(mockLocalStore)) delete mockLocalStore[k];
          return Promise.resolve();
        }),
      },
      session: {
        get: vi.fn((key: string) =>
          Promise.resolve(
            key in mockSessionStore ? { [key]: mockSessionStore[key] } : {},
          ),
        ),
        set: vi.fn((data: Record<string, any>) => {
          Object.assign(mockSessionStore, data);
          return Promise.resolve();
        }),
        remove: vi.fn((key: string) => {
          delete mockSessionStore[key];
          return Promise.resolve();
        }),
      },
      onChanged: { addListener: vi.fn() },
    },
    alarms: {
      create: vi.fn((name: string, info: any) => {
        // Remove any existing alarm with the same name (Chrome behaviour)
        mockPendingAlarms = mockPendingAlarms.filter((a) => a.name !== name);
        if (info.periodInMinutes) {
          // Periodic alarm — schedule first tick
          const scheduledTime = Date.now() + info.periodInMinutes * 60_000;
          mockPendingAlarms.push({ name, scheduledTime });
        } else if (info.delayInMinutes) {
          const scheduledTime = Date.now() + info.delayInMinutes * 60_000;
          mockPendingAlarms.push({ name, scheduledTime });
        }
        return Promise.resolve();
      }),
      clear: vi.fn((name: string) => {
        mockPendingAlarms = mockPendingAlarms.filter((a) => a.name !== name);
        return Promise.resolve(true);
      }),
      onAlarm: {
        addListener: vi.fn(),
      },
    },
    runtime: {
      onMessage: { addListener: vi.fn() },
      sendMessage: vi.fn(() => Promise.resolve()),
      connect: vi.fn(() => ({
        onDisconnect: { addListener: vi.fn() },
        disconnect: vi.fn(),
      })),
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

import LockManager, {
  LOCK_MANAGER_MESSAGES,
  type DecryptedKeyType,
} from "./lockManager";

// ── Helpers ────────────────────────────────────────────────────────

const MOCK_KEYS: DecryptedKeyType[] = [
  {
    address: "Q20B714091cF2a62DADda2847803e3f1B9D2D3779",
    mnemonicPhrases: "word ".repeat(24).trim(),
  },
];

const clearStore = (store: Record<string, any>) => {
  for (const k of Object.keys(store)) delete store[k];
};

/** Seed mockLocalStore so isLocked() doesn't call clearAllData(). */
const seedStorage = () => {
  mockLocalStore["KEYSTORES"] = JSON.stringify([{ address: "0x123" }]);
  mockLocalStore["ACCOUNTS"] = { ALL_ACCOUNTS: ["0x123"] };
};

const minutes = (m: number) => m * 60_000;

/**
 * Advance Jest fake clock by `ms` then fire any alarms whose scheduled
 * time has been reached.  Dispatches directly to LockManager handlers
 * (mirroring serviceWorker.ts alarm listener). Returns the number of
 * alarms fired.
 */
async function advanceAndFireAlarms(ms: number): Promise<number> {
  vi.advanceTimersByTime(ms);
  let fired = 0;
  const now = Date.now();
  const due = mockPendingAlarms.filter((a) => a.scheduledTime <= now);
  mockPendingAlarms = mockPendingAlarms.filter((a) => a.scheduledTime > now);
  for (const alarm of due) {
    // Dispatch to LockManager just like serviceWorker.ts does
    if (alarm.name === LockManager.AUTO_LOCK_ALARM) {
      await LockManager.handleAutoLockAlarm();
    } else if (alarm.name === LockManager.KEEP_ALIVE_ALARM) {
      await LockManager.handleKeepAliveAlarm();
    }
    fired++;
  }
  return fired;
}

/** Simulate sending a message through the lockManagerListener (like the popup does). */
async function sendMessage(name: string, data?: any) {
  return LockManager.lockManagerListener({ name, data });
}

async function unlockWallet() {
  return sendMessage(LOCK_MANAGER_MESSAGES.SET_DECRYPTED_KEYS, MOCK_KEYS);
}

/**
 * Check lock state WITHOUT going through lockManagerListener,
 * so it doesn't reset the auto-lock timer (activity reset).
 */
async function checkLocked(): Promise<boolean> {
  const result = await LockManager.isLocked();
  return result.isLocked;
}

// ── Setup / teardown ───────────────────────────────────────────────

describe("Auto-lock integration scenarios", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    clearStore(mockLocalStore);
    clearStore(mockSessionStore);
    mockPendingAlarms = [];
    await LockManager.lock();
    seedStorage();
  });

  afterEach(async () => {
    await LockManager.lock();
    vi.useRealTimers();
  });

  // ── Scenario 1: Basic auto-lock at 15 minutes ─────────────────

  describe("15-minute auto-lock", () => {
    beforeEach(() => {
      mockLocalStore["SETTINGS"] = { autoLockMinutes: 15 };
    });

    it("should stay unlocked at 14 minutes", async () => {
      await unlockWallet();

      await advanceAndFireAlarms(minutes(14));

      expect(await checkLocked()).toBe(false);
    });

    it("should lock after 15 minutes of inactivity", async () => {
      await unlockWallet();

      const fired = await advanceAndFireAlarms(minutes(15) + 1);

      expect(fired).toBeGreaterThanOrEqual(1);
      expect(await checkLocked()).toBe(true);
      expect(mockLocalStore["LOCK_MANAGER_LOCKED_TIMESTAMP"]).toBeDefined();
    });

    it("should stay unlocked at 14:59 and lock at 15:01", async () => {
      await unlockWallet();

      // At 14:59 — still unlocked
      await advanceAndFireAlarms(minutes(14) + 59_000);
      expect(await checkLocked()).toBe(false);

      // Advance 2 more seconds (total 15:01) — alarm fires
      const fired = await advanceAndFireAlarms(2_000);
      expect(fired).toBeGreaterThanOrEqual(1);
      expect(await checkLocked()).toBe(true);
    });
  });

  // ── Scenario 2: Activity resets the timer ──────────────────────

  describe("activity reset", () => {
    beforeEach(() => {
      mockLocalStore["SETTINGS"] = { autoLockMinutes: 15 };
    });

    it("should reset timer when activity happens before timeout", async () => {
      await unlockWallet();

      // 10 minutes pass — still well within timeout
      await advanceAndFireAlarms(minutes(10));
      expect(await checkLocked()).toBe(false);

      // Activity at 10 min — sends a GET_WALLET_PASSWORD message
      // This triggers the activity reset in lockManagerListener
      await sendMessage(LOCK_MANAGER_MESSAGES.GET_WALLET_PASSWORD);
      // The alarm was recreated with fresh 15 minutes from now

      // 10 more minutes (total 20 min from start, but only 10 from last activity)
      await advanceAndFireAlarms(minutes(10));
      expect(await checkLocked()).toBe(false);

      // 5 more minutes (total 25 min from start, 15 from last activity) — should lock
      const fired = await advanceAndFireAlarms(minutes(5) + 1);
      expect(fired).toBeGreaterThanOrEqual(1);
      expect(await checkLocked()).toBe(true);
    });

    it("should keep extending as long as activity continues", async () => {
      await unlockWallet();

      // Simulate activity every 10 minutes for an hour
      for (let i = 0; i < 6; i++) {
        await advanceAndFireAlarms(minutes(10));
        expect(await checkLocked()).toBe(false);
        // Activity — e.g. user checks balance
        await sendMessage(LOCK_MANAGER_MESSAGES.GET_DECRYPTED_KEYS);
      }

      // Total 60 minutes of activity — still unlocked
      expect(await checkLocked()).toBe(false);

      // Now stop activity — should lock after 15 minutes
      const fired = await advanceAndFireAlarms(minutes(15) + 1);
      expect(fired).toBeGreaterThanOrEqual(1);
      expect(await checkLocked()).toBe(true);
    });
  });

  // ── Scenario 3: "Never" auto-lock (0 minutes) ─────────────────

  describe("auto-lock disabled (Never / 0 minutes)", () => {
    beforeEach(() => {
      mockLocalStore["SETTINGS"] = { autoLockMinutes: 0 };
    });

    it("should never lock regardless of time", async () => {
      await unlockWallet();

      // Advance 24 hours
      await advanceAndFireAlarms(minutes(60 * 24));
      expect(await checkLocked()).toBe(false);
    });
  });

  // ── Scenario 4: Manual lock overrides everything ───────────────

  describe("manual lock", () => {
    beforeEach(() => {
      mockLocalStore["SETTINGS"] = { autoLockMinutes: 15 };
    });

    it("should lock immediately on manual lock, clearing alarms", async () => {
      await unlockWallet();
      expect(await checkLocked()).toBe(false);

      // Manual lock at 5 minutes
      await advanceAndFireAlarms(minutes(5));
      await sendMessage(LOCK_MANAGER_MESSAGES.LOCK);

      expect(await checkLocked()).toBe(true);
      expect(mockPendingAlarms).toHaveLength(0); // all alarms cleared
    });
  });

  // ── Scenario 5: Change auto-lock setting while unlocked ────────

  describe("settings change while unlocked", () => {
    it("should apply new shorter timeout immediately", async () => {
      mockLocalStore["SETTINGS"] = { autoLockMinutes: 15 };
      await unlockWallet();

      // 5 minutes pass
      await advanceAndFireAlarms(minutes(5));
      expect(await checkLocked()).toBe(false);

      // User changes setting to 1 minute
      mockLocalStore["SETTINGS"] = { autoLockMinutes: 1 };
      await sendMessage(LOCK_MANAGER_MESSAGES.UPDATE_AUTO_LOCK);

      // 30 seconds — still unlocked
      await advanceAndFireAlarms(30_000);
      expect(await checkLocked()).toBe(false);

      // 31 more seconds (total 1:01 from setting change) — should lock
      const fired = await advanceAndFireAlarms(31_000);
      expect(fired).toBeGreaterThanOrEqual(1);
      expect(await checkLocked()).toBe(true);
    });

    it("should switch from timed to Never without locking", async () => {
      mockLocalStore["SETTINGS"] = { autoLockMinutes: 5 };
      await unlockWallet();

      // 3 minutes pass
      await advanceAndFireAlarms(minutes(3));

      // Change to "Never"
      mockLocalStore["SETTINGS"] = { autoLockMinutes: 0 };
      await sendMessage(LOCK_MANAGER_MESSAGES.UPDATE_AUTO_LOCK);

      // Advance way past original timeout
      await advanceAndFireAlarms(minutes(30));
      expect(await checkLocked()).toBe(false);
    });

    it("should switch from Never to timed and lock after timeout", async () => {
      mockLocalStore["SETTINGS"] = { autoLockMinutes: 0 };
      await unlockWallet();

      await advanceAndFireAlarms(minutes(60));
      expect(await checkLocked()).toBe(false);

      // Change to 2 minutes
      mockLocalStore["SETTINGS"] = { autoLockMinutes: 2 };
      await sendMessage(LOCK_MANAGER_MESSAGES.UPDATE_AUTO_LOCK);

      // 1 minute — still unlocked
      await advanceAndFireAlarms(minutes(1));
      expect(await checkLocked()).toBe(false);

      // 1 more minute + buffer — should lock
      const fired = await advanceAndFireAlarms(minutes(1) + 1);
      expect(fired).toBeGreaterThanOrEqual(1);
      expect(await checkLocked()).toBe(true);
    });
  });

  // ── Scenario 6: Various auto-lock durations ────────────────────

  describe.each([
    { autoLockMinutes: 1, label: "1 minute" },
    { autoLockMinutes: 5, label: "5 minutes" },
    { autoLockMinutes: 15, label: "15 minutes" },
    { autoLockMinutes: 30, label: "30 minutes" },
    { autoLockMinutes: 60, label: "1 hour" },
  ])("$label auto-lock", ({ autoLockMinutes }) => {
    it(`should stay unlocked at ${autoLockMinutes - 0.5} min and lock at ${autoLockMinutes + 0.5} min`, async () => {
      mockLocalStore["SETTINGS"] = { autoLockMinutes };
      await unlockWallet();

      // 30 seconds before timeout — still unlocked
      await advanceAndFireAlarms(minutes(autoLockMinutes) - 30_000);
      expect(await checkLocked()).toBe(false);

      // 1 minute later (30 seconds past timeout) — locked
      const fired = await advanceAndFireAlarms(60_000);
      expect(fired).toBeGreaterThanOrEqual(1);
      expect(await checkLocked()).toBe(true);
    });
  });

  // ── Scenario 7: Timestamp correctness ──────────────────────────

  describe("timestamps", () => {
    it("should have LOCKED > UNLOCKED after auto-lock", async () => {
      mockLocalStore["SETTINGS"] = { autoLockMinutes: 1 };

      await unlockWallet();
      // Simulate the popup saving the UNLOCKED timestamp (as it does in lockStore.unlock)
      mockLocalStore["LOCK_MANAGER_UNLOCKED_TIMESTAMP"] = Date.now();

      await advanceAndFireAlarms(minutes(1) + 1);
      expect(await checkLocked()).toBe(true);

      const lockedTs = mockLocalStore["LOCK_MANAGER_LOCKED_TIMESTAMP"];
      const unlockedTs = mockLocalStore["LOCK_MANAGER_UNLOCKED_TIMESTAMP"];

      expect(lockedTs).toBeDefined();
      expect(unlockedTs).toBeDefined();
      expect(lockedTs).toBeGreaterThan(unlockedTs);
    });
  });
});
