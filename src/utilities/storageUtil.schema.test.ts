import { beforeEach, describe, expect, it, vi } from "vitest";

const localStore: Record<string, unknown> = {};

vi.mock("webextension-polyfill", () => ({
  __esModule: true,
  default: {
    storage: {
      local: {
        get: vi.fn((key: string) =>
          Promise.resolve(key in localStore ? { [key]: localStore[key] } : {}),
        ),
        set: vi.fn((data: Record<string, unknown>) => {
          Object.assign(localStore, data);
          return Promise.resolve();
        }),
      },
    },
  },
}));

import StorageUtil, { STORAGE_SCHEMA_VERSION } from "./storageUtil";

const VERSION_KEY = "STORAGE_SCHEMA_VERSION";
const KEYSTORES = { KEYSTORES: JSON.stringify([{ address: "Qab" }]) };
const ACCOUNTS = { ACCOUNTS: { ALL_ACCOUNTS: ["Qab"] } };
const LEDGER = { LEDGER: { LEDGER_ACCOUNTS: [{ address: "Qab" }] } };

const store = (data: Record<string, unknown>) => {
  for (const key of Object.keys(localStore)) delete localStore[key];
  Object.assign(localStore, data);
};

describe("storage schema state", () => {
  beforeEach(() => {
    store({});
  });

  it("stamps a fresh install with this build's version", async () => {
    expect(await StorageUtil.getStorageSchemaState()).toBe("current");
    expect(localStore).toEqual({ [VERSION_KEY]: STORAGE_SCHEMA_VERSION });
  });

  it("reads a wallet stored under this build's version as current", async () => {
    store({ ...KEYSTORES, [VERSION_KEY]: STORAGE_SCHEMA_VERSION });

    expect(await StorageUtil.getStorageSchemaState()).toBe("current");
  });

  it.each([
    ["keystores", KEYSTORES],
    ["accounts", ACCOUNTS],
    ["Ledger accounts", LEDGER],
  ])(
    "reads stored %s without a version as outdated and writes nothing",
    async (_label, data) => {
      store(data);

      expect(await StorageUtil.getStorageSchemaState()).toBe("outdated");
      expect(localStore).toEqual(data);
    },
  );

  it.each([
    ["a lower version", STORAGE_SCHEMA_VERSION - 1],
    ["a version that is not a number", String(STORAGE_SCHEMA_VERSION)],
    ["an empty version", null],
  ])("reads a wallet stored under %s as outdated", async (_label, version) => {
    store({ ...KEYSTORES, [VERSION_KEY]: version });

    expect(await StorageUtil.getStorageSchemaState()).toBe("outdated");
    expect(localStore[VERSION_KEY]).toBe(version);
  });

  it("leaves a wallet stored under a higher version alone", async () => {
    const newer = { ...KEYSTORES, [VERSION_KEY]: STORAGE_SCHEMA_VERSION + 1 };
    store(newer);

    expect(await StorageUtil.getStorageSchemaState()).toBe("current");
    expect(localStore).toEqual(newer);
  });

  it("counts keystores it cannot read as a stored wallet", async () => {
    store({ KEYSTORES: "{not json" });

    expect(await StorageUtil.getStorageSchemaState()).toBe("outdated");
  });

  it("stamps an install whose stored lists are empty", async () => {
    store({ KEYSTORES: "[]", ACCOUNTS: { ALL_ACCOUNTS: [] } });

    expect(await StorageUtil.getStorageSchemaState()).toBe("current");
    expect(localStore[VERSION_KEY]).toBe(STORAGE_SCHEMA_VERSION);
  });
});
