import { beforeEach, describe, expect, it, vi } from "vitest";

const { localStore, sessionStore, alarmsStore, area } = vi.hoisted(() => {
  const stores: Record<string, Record<string, unknown>> = {
    local: {},
    session: {},
    alarms: {},
  };
  return {
    localStore: stores.local,
    sessionStore: stores.session,
    alarmsStore: stores.alarms,
    area: (store: Record<string, unknown>) => ({
      get: vi.fn((key: string) =>
        Promise.resolve(key in store ? { [key]: store[key] } : {}),
      ),
      set: vi.fn((data: Record<string, unknown>) => {
        Object.assign(store, data);
        return Promise.resolve();
      }),
      remove: vi.fn((key: string) => {
        Reflect.deleteProperty(store, key);
        return Promise.resolve();
      }),
      clear: vi.fn(() => {
        for (const key of Object.keys(store)) Reflect.deleteProperty(store, key);
        return Promise.resolve();
      }),
    }),
  };
});

vi.mock("webextension-polyfill", () => ({
  __esModule: true,
  default: {
    storage: { local: area(localStore), session: area(sessionStore) },
    alarms: {
      create: vi.fn((name: string, info: unknown) => {
        alarmsStore[name] = info;
        return Promise.resolve();
      }),
      clear: vi.fn((name: string) => {
        Reflect.deleteProperty(alarmsStore, name);
        return Promise.resolve(true);
      }),
      get: vi.fn((name: string) => Promise.resolve(alarmsStore[name] ?? null)),
    },
    runtime: {
      getURL: (path: string) => `chrome-extension://test-wallet/${path}`,
    },
  },
}));

vi.mock("@theqrl/web3", () => ({ Bytes: {} }));
vi.mock("@theqrl/web3-qrl-accounts", () => ({
  decrypt: vi.fn(),
  encrypt: vi.fn(),
}));
vi.mock("@/functions/getMnemonicFromHexSeed", () => ({
  getMnemonicFromHexSeed: vi.fn(() => "mocked mnemonic"),
}));

import browser from "webextension-polyfill";
import { STORAGE_SCHEMA_VERSION } from "@/utilities/storageUtil";
import LockManager, {
  LOCK_MANAGER_MESSAGES,
  OUTDATED_STORAGE_MESSAGE,
} from "./lockManager";

const VERSION_KEY = "STORAGE_SCHEMA_VERSION";
const EXTENSION_PAGE = { url: "chrome-extension://test-wallet/popup.html" };
const OLD_WALLET = {
  KEYSTORES: JSON.stringify([{ address: "Qab" }]),
  ACCOUNTS: { ALL_ACCOUNTS: ["Qab"] },
  SETTINGS: { language: "de" },
};
const KEYS = [{ address: "Qab", seed: "0x01", mnemonicPhrases: "words" }];

const fill = (store: Record<string, unknown>, data: Record<string, unknown>) => {
  for (const key of Object.keys(store)) Reflect.deleteProperty(store, key);
  Object.assign(store, data);
};

const heldKeys = () => Reflect.get(LockManager, "decryptedKeys") as unknown;

describe("removing a wallet stored by an earlier build", () => {
  beforeEach(async () => {
    fill(localStore, {});
    fill(sessionStore, {});
    await LockManager.lock();
  });

  it("clears the keys, both storage areas and stamps this build's version", async () => {
    fill(localStore, OLD_WALLET);
    await LockManager.setDecryptedKeysFromPopup({ keys: KEYS, walletPassword: "pw" });
    fill(sessionStore, { ...sessionStore, OTHER_SESSION_VALUE: 1 });

    expect(await LockManager.resetOutdatedStorage()).toEqual({ removed: true });

    expect(localStore).toEqual({ [VERSION_KEY]: STORAGE_SCHEMA_VERSION });
    expect(sessionStore).toEqual({});
    expect(heldKeys()).toBeUndefined();
  });

  it("removes the wallet even when a cleanup step of its lock fails", async () => {
    fill(localStore, OLD_WALLET);
    await LockManager.setDecryptedKeysFromPopup({ keys: KEYS, walletPassword: "pw" });
    // The next write is the LOCKED timestamp of the lock that the removal
    // starts with. The removal clears that timestamp a moment later anyway.
    vi.mocked(browser.storage.local.set).mockRejectedValueOnce(
      new Error("storage failed"),
    );
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await LockManager.resetOutdatedStorage()).toEqual({ removed: true });

    expect(localStore).toEqual({ [VERSION_KEY]: STORAGE_SCHEMA_VERSION });
    expect(sessionStore).toEqual({});
    expect(heldKeys()).toBeUndefined();
    expect(warned).toHaveBeenCalled();
    warned.mockRestore();
  });

  it.each([
    ["this build's", STORAGE_SCHEMA_VERSION],
    ["a newer build's", STORAGE_SCHEMA_VERSION + 1],
  ])("removes nothing from %s store", async (_label, version) => {
    const wallet = { ...OLD_WALLET, [VERSION_KEY]: version };
    fill(localStore, wallet);
    await LockManager.setDecryptedKeysFromPopup({ keys: KEYS, walletPassword: "pw" });

    expect(await LockManager.resetOutdatedStorage()).toEqual({ removed: false });

    // The wallet as it was, with the timestamp the unlock above wrote.
    expect(localStore).toEqual({
      ...wallet,
      LOCK_MANAGER_UNLOCKED_TIMESTAMP: expect.any(Number),
    });
    expect(heldKeys()).toEqual(KEYS);
  });

  it("runs when an extension page asks for it", async () => {
    fill(localStore, OLD_WALLET);

    expect(
      await LockManager.lockManagerListener(
        { name: LOCK_MANAGER_MESSAGES.RESET_OUTDATED_STORAGE, data: undefined },
        EXTENSION_PAGE,
      ),
    ).toEqual({ removed: true });
    expect(localStore).toEqual({ [VERSION_KEY]: STORAGE_SCHEMA_VERSION });
  });

  it("is refused to a content script", async () => {
    fill(localStore, OLD_WALLET);

    expect(
      await LockManager.lockManagerListener(
        { name: LOCK_MANAGER_MESSAGES.RESET_OUTDATED_STORAGE, data: undefined },
        { url: "https://dapp.example" },
      ),
    ).toBeUndefined();
    expect(localStore).toEqual(OLD_WALLET);
  });

  it.each([
    LOCK_MANAGER_MESSAGES.IS_LOCKED,
    LOCK_MANAGER_MESSAGES.GET_DECRYPTED_KEYS,
    LOCK_MANAGER_MESSAGES.GET_WALLET_PASSWORD,
    LOCK_MANAGER_MESSAGES.SET_DECRYPTED_KEYS,
    LOCK_MANAGER_MESSAGES.ENCRYPT_ACCOUNT,
  ])("refuses %s while the store is outdated", async (name) => {
    fill(localStore, OLD_WALLET);

    await expect(
      LockManager.lockManagerListener({ name, data: KEYS }, EXTENSION_PAGE),
    ).rejects.toThrow(OUTDATED_STORAGE_MESSAGE);

    expect(localStore).toEqual(OLD_WALLET);
    expect(sessionStore).toEqual({});
    expect(heldKeys()).toBeUndefined();
  });

  it("answers as before once the store is current", async () => {
    expect(
      await LockManager.lockManagerListener(
        { name: LOCK_MANAGER_MESSAGES.IS_LOCKED, data: undefined },
        EXTENSION_PAGE,
      ),
    ).toMatchObject({ isLocked: true });
    expect(localStore[VERSION_KEY]).toBe(STORAGE_SCHEMA_VERSION);
  });
});
