import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Plain object stores (hoisting-safe) ────────────────────────────
const localStore: Record<string, any> = {};

const { mockSendMessage, mockOnChangedListeners } = vi.hoisted(() => ({
  mockSendMessage: vi.fn(() => Promise.resolve({} as any)),
  mockOnChangedListeners: [] as ((
    changes: Record<string, unknown>,
    areaName: string,
  ) => void)[],
}));

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
        get: vi.fn(() => Promise.resolve({})),
        set: vi.fn(() => Promise.resolve()),
      },
      onChanged: {
        addListener: vi.fn((cb) => {
          mockOnChangedListeners.push(cb);
        }),
      },
    },
    runtime: {
      sendMessage: mockSendMessage,
      connect: vi.fn(() => ({
        onDisconnect: { addListener: vi.fn() },
        disconnect: vi.fn(),
      })),
    },
  },
}));

vi.mock("@theqrl/web3", () => ({
  Web3BaseWalletAccount: class {},
}));

const clearStore = (store: Record<string, any>) => {
  for (const k of Object.keys(store)) delete store[k];
};

import type { DecryptedKeyType } from "@/scripts/lockManager/lockManager";

const MOCK_KEYS: DecryptedKeyType[] = [
  {
    password: "test123",
    address: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
    seed: "0x010000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    mnemonicPhrases: "mocked mnemonic",
  },
];

describe("LockStore – readLockState timestamp check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStore(localStore);
    mockOnChangedListeners.length = 0;
  });

  function fireStorageChange(
    changes: Record<string, unknown>,
    areaName: string,
  ) {
    const listener = mockOnChangedListeners.at(-1);
    return listener?.(changes, areaName);
  }

  async function createLockStore() {
    // Mock initial IS_LOCKED response for the constructor's initialize()
    mockSendMessage.mockResolvedValueOnce({
      isLocked: false,
      hasPasswordSet: true,
    });

    const module = await import("./lockStore");
    const store = new module.default();

    // Wait for async constructor initialization
    await new Promise((r) => setTimeout(r, 300));

    return store;
  }

  // Runs first in this file, deliberately: registerActivityPing() adds
  // document-level event listeners that this test file has no way to
  // remove again (LockStore exposes no teardown), so every LockStore
  // created anywhere in this file keeps listening for the rest of the run.
  // Placed first, before any other describe block creates a store, so the
  // very first dispatched event here is answered by exactly one listener.
  // Every later dispatch in this block still only produces one call: any
  // still-listening store from an earlier test in this block already
  // consumed its one free ping and is now inside its own 30s throttle
  // window (real time, since these tests do not use fake timers), so it
  // stays silent. Stores created by the *other* describe blocks below
  // never dispatch a DOM event at all, so they never interfere either.
  describe("registerActivityPing", () => {
    it("should send a USER_ACTIVITY ping on pointerdown", async () => {
      await createLockStore();
      mockSendMessage.mockClear();

      document.dispatchEvent(new Event("pointerdown"));
      await Promise.resolve();

      const activityCalls = mockSendMessage.mock.calls.filter(
        (call: any) => call[0]?.name === "LOCK_MANAGER_USER_ACTIVITY",
      );
      expect(activityCalls).toHaveLength(1);
    });

    it("should send a USER_ACTIVITY ping on keydown, wheel and a captured scroll", async () => {
      const store = await createLockStore();

      for (const eventName of ["keydown", "wheel", "scroll"] as const) {
        // Bypass this store's own throttle deterministically: avoids
        // waiting out 30 real seconds per iteration.
        (store as any).lastActivityPingAt = 0;
        mockSendMessage.mockClear();

        document.dispatchEvent(new Event(eventName));
        await Promise.resolve();

        const activityCalls = mockSendMessage.mock.calls.filter(
          (call: any) => call[0]?.name === "LOCK_MANAGER_USER_ACTIVITY",
        );
        expect(activityCalls).toHaveLength(1);
      }
    });

    it("should send a USER_ACTIVITY ping when the document becomes visible", async () => {
      const store = await createLockStore();
      (store as any).lastActivityPingAt = 0;
      mockSendMessage.mockClear();
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });

      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();

      const activityCalls = mockSendMessage.mock.calls.filter(
        (call: any) => call[0]?.name === "LOCK_MANAGER_USER_ACTIVITY",
      );
      expect(activityCalls).toHaveLength(1);
    });

    it("should throttle repeated pings to at most one per 30s", async () => {
      const store = await createLockStore();
      (store as any).lastActivityPingAt = 0;
      mockSendMessage.mockClear();

      document.dispatchEvent(new Event("pointerdown"));
      await Promise.resolve();
      document.dispatchEvent(new Event("keydown"));
      await Promise.resolve();
      document.dispatchEvent(new Event("keydown"));
      await Promise.resolve();

      let activityCalls = mockSendMessage.mock.calls.filter(
        (call: any) => call[0]?.name === "LOCK_MANAGER_USER_ACTIVITY",
      );
      expect(activityCalls).toHaveLength(1);

      // Simulate the 30s throttle window having elapsed.
      (store as any).lastActivityPingAt = Date.now() - 31_000;
      document.dispatchEvent(new Event("keydown"));
      await Promise.resolve();

      activityCalls = mockSendMessage.mock.calls.filter(
        (call: any) => call[0]?.name === "LOCK_MANAGER_USER_ACTIVITY",
      );
      expect(activityCalls).toHaveLength(2);
    });
  });

  describe("readLockState with cachedKeys", () => {
    it("should clear cachedKeys when LOCKED timestamp > UNLOCKED timestamp (intentional lock)", async () => {
      const store = await createLockStore();

      // Simulate having cached keys (from a previous unlock)
      (store as any).cachedKeys = MOCK_KEYS;

      // Set timestamps: locked AFTER unlocked = intentional lock
      localStore["LOCK_MANAGER_UNLOCKED_TIMESTAMP"] = 1000;
      localStore["LOCK_MANAGER_LOCKED_TIMESTAMP"] = 2000;

      // SW reports locked
      mockSendMessage.mockResolvedValueOnce({
        isLocked: true,
        hasPasswordSet: true,
      });

      await store.readLockState();

      // cachedKeys should be cleared (not re-sent)
      expect((store as any).cachedKeys).toBeUndefined();
      expect(store.isLocked).toBe(true);

      // SET_DECRYPTED_KEYS should NOT have been sent
      const setKeysCalls = mockSendMessage.mock.calls.filter(
        (call: any) => call[0]?.name === "SET_DECRYPTED_KEYS",
      );
      expect(setKeysCalls).toHaveLength(0);
    });

    it("should re-send cachedKeys when UNLOCKED timestamp > LOCKED timestamp (SW restart)", async () => {
      const store = await createLockStore();

      (store as any).cachedKeys = MOCK_KEYS;

      // Set timestamps: unlocked AFTER locked = SW restart
      localStore["LOCK_MANAGER_UNLOCKED_TIMESTAMP"] = 2000;
      localStore["LOCK_MANAGER_LOCKED_TIMESTAMP"] = 1000;

      // First call: IS_LOCKED returns locked
      // Second call: SET_DECRYPTED_KEYS succeeds
      // Third call: IS_LOCKED recheck returns unlocked
      mockSendMessage
        .mockResolvedValueOnce({ isLocked: true, hasPasswordSet: true })
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ isLocked: false, hasPasswordSet: true });

      await store.readLockState();

      // Keys should have been re-sent
      const setKeysCalls = mockSendMessage.mock.calls.filter(
        (call: any) => call[0]?.name === "SET_DECRYPTED_KEYS",
      );
      expect(setKeysCalls).toHaveLength(1);
      expect((setKeysCalls[0] as any)[0].data).toEqual(MOCK_KEYS);

      // Wallet should now be unlocked
      expect(store.isLocked).toBe(false);
    });

    it("should re-send cachedKeys when no timestamps exist (both are 0)", async () => {
      const store = await createLockStore();

      (store as any).cachedKeys = MOCK_KEYS;

      // No timestamps in storage — both default to 0
      // lockedTs (0) is NOT > unlockedTs (0), so keys should be re-sent

      mockSendMessage
        .mockResolvedValueOnce({ isLocked: true, hasPasswordSet: true })
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ isLocked: false, hasPasswordSet: true });

      await store.readLockState();

      const setKeysCalls = mockSendMessage.mock.calls.filter(
        (call: any) => call[0]?.name === "SET_DECRYPTED_KEYS",
      );
      expect(setKeysCalls).toHaveLength(1);
    });

    it("should not re-send keys when there are no cachedKeys", async () => {
      const store = await createLockStore();

      (store as any).cachedKeys = undefined;

      mockSendMessage.mockResolvedValueOnce({
        isLocked: true,
        hasPasswordSet: true,
      });

      await store.readLockState();

      const setKeysCalls = mockSendMessage.mock.calls.filter(
        (call: any) => call[0]?.name === "SET_DECRYPTED_KEYS",
      );
      expect(setKeysCalls).toHaveLength(0);
      expect(store.isLocked).toBe(true);
    });

    it("should accept locked state when re-send fails", async () => {
      const store = await createLockStore();

      (store as any).cachedKeys = MOCK_KEYS;

      // Timestamps indicate SW restart
      localStore["LOCK_MANAGER_UNLOCKED_TIMESTAMP"] = 2000;
      localStore["LOCK_MANAGER_LOCKED_TIMESTAMP"] = 1000;

      // IS_LOCKED returns locked, SET_DECRYPTED_KEYS fails
      mockSendMessage
        .mockResolvedValueOnce({ isLocked: true, hasPasswordSet: true })
        .mockRejectedValueOnce(new Error("SW not reachable"));

      await store.readLockState();

      expect(store.isLocked).toBe(true);
    });
  });

  describe("initializeStorageListener (automated-traffic filter)", () => {
    it("should ignore a local-storage change limited to the price cache", async () => {
      await createLockStore();
      mockSendMessage.mockClear();

      await fireStorageChange({ PRICE_CACHE: { newValue: {} } }, "local");

      const isLockedCalls = mockSendMessage.mock.calls.filter(
        (call: any) => call[0]?.name === "LOCK_MANAGER_IS_LOCKED",
      );
      expect(isLockedCalls).toHaveLength(0);
    });

    it("should ignore a session-storage change limited to the keep-alive key", async () => {
      await createLockStore();
      mockSendMessage.mockClear();

      await fireStorageChange({ keepAlive: { newValue: 123 } }, "session");

      const isLockedCalls = mockSendMessage.mock.calls.filter(
        (call: any) => call[0]?.name === "LOCK_MANAGER_IS_LOCKED",
      );
      expect(isLockedCalls).toHaveLength(0);
    });

    it("should still react to a local-storage change outside the automated set", async () => {
      const store = await createLockStore();
      mockSendMessage.mockClear();
      mockSendMessage.mockResolvedValueOnce({
        isLocked: false,
        hasPasswordSet: true,
      });

      await fireStorageChange(
        { LOCK_MANAGER_LOCKED_TIMESTAMP: { newValue: 123 } },
        "local",
      );

      expect(store.readLockState).toBeDefined();
      const isLockedCalls = mockSendMessage.mock.calls.filter(
        (call: any) => call[0]?.name === "LOCK_MANAGER_IS_LOCKED",
      );
      expect(isLockedCalls).toHaveLength(1);
    });

    it("should still react to a session-storage change outside the automated set (the decrypted-keys backup)", async () => {
      await createLockStore();
      mockSendMessage.mockClear();
      mockSendMessage.mockResolvedValueOnce({
        isLocked: false,
        hasPasswordSet: true,
      });

      await fireStorageChange(
        { _LM_CACHED_KEYS: { newValue: MOCK_KEYS } },
        "session",
      );

      const isLockedCalls = mockSendMessage.mock.calls.filter(
        (call: any) => call[0]?.name === "LOCK_MANAGER_IS_LOCKED",
      );
      expect(isLockedCalls).toHaveLength(1);
    });

    it("should react when a mixed change includes a non-automated key", async () => {
      await createLockStore();
      mockSendMessage.mockClear();
      mockSendMessage.mockResolvedValueOnce({
        isLocked: false,
        hasPasswordSet: true,
      });

      await fireStorageChange(
        { keepAlive: { newValue: 1 }, LOCK_MANAGER_LOCKED_TIMESTAMP: { newValue: 2 } },
        "session",
      );

      const isLockedCalls = mockSendMessage.mock.calls.filter(
        (call: any) => call[0]?.name === "LOCK_MANAGER_IS_LOCKED",
      );
      expect(isLockedCalls).toHaveLength(1);
    });
  });
});
