import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Plain object stores (hoisting-safe) ────────────────────────────
const localStore: Record<string, any> = {};

const { mockSendMessage } = vi.hoisted(() => ({
  mockSendMessage: vi.fn(() => Promise.resolve({} as any)),
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
      onChanged: { addListener: vi.fn() },
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
    address: "Q20B714091cF2a62DADda2847803e3f1B9D2D3779",
    mnemonicPhrases: "mocked mnemonic",
  },
];

describe("LockStore – readLockState timestamp check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStore(localStore);
  });

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
});
