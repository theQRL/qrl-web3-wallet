import { beforeEach, describe, expect, it, vi } from "vitest";
import HiddenAccountsStore from "./hiddenAccountsStore";

const localStore: Record<string, any> = {};
vi.mock("webextension-polyfill", () => ({
  __esModule: true,
  default: {
    storage: {
      local: {
        get: vi.fn((key: string) =>
          Promise.resolve(key in localStore ? { [key]: localStore[key] } : {}),
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
    },
  },
}));

describe("HiddenAccountsStore", () => {
  let store: HiddenAccountsStore;

  beforeEach(() => {
    for (const k of Object.keys(localStore)) delete localStore[k];
    store = new HiddenAccountsStore();
  });

  describe("loadHiddenAccounts", () => {
    it("should load hidden accounts from storage", async () => {
      localStore["HIDDEN_ACCOUNTS"] = {
        Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: true,
      };

      await store.loadHiddenAccounts();

      expect(store.hiddenAccounts).toEqual({
        Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: true,
      });
    });

    it("should return empty object when no hidden accounts in storage", async () => {
      await store.loadHiddenAccounts();

      expect(store.hiddenAccounts).toEqual({});
    });
  });

  describe("hideAccount", () => {
    it("should mark an account as hidden", async () => {
      await store.hideAccount("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000");

      expect(
        store.isHidden("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000"),
      ).toBe(true);
    });

    it("should persist to storage", async () => {
      await store.hideAccount("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000");

      expect(localStore["HIDDEN_ACCOUNTS"]).toEqual({
        Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: true,
      });
    });

    it("should preserve existing hidden accounts", async () => {
      await store.hideAccount("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000");
      await store.hideAccount("Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000");

      expect(
        store.isHidden("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000"),
      ).toBe(true);
      expect(
        store.isHidden("Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000"),
      ).toBe(true);
    });
  });

  describe("unhideAccount", () => {
    it("should remove an account from hidden list", async () => {
      await store.hideAccount("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000");
      await store.unhideAccount("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000");

      expect(
        store.isHidden("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000"),
      ).toBe(false);
    });

    it("should persist to storage after unhide", async () => {
      await store.hideAccount("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000");
      await store.hideAccount("Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000");
      await store.unhideAccount("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000");

      expect(localStore["HIDDEN_ACCOUNTS"]).toEqual({
        Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000: true,
      });
    });
  });

  describe("isHidden", () => {
    it("should return true for hidden account", async () => {
      await store.hideAccount("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000");

      expect(
        store.isHidden("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000"),
      ).toBe(true);
    });

    it("should return false for non-hidden account", () => {
      expect(
        store.isHidden("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000"),
      ).toBe(false);
    });
  });

  describe("hiddenAddresses", () => {
    it("should return list of hidden addresses", async () => {
      await store.hideAccount("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000");
      await store.hideAccount("Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000");

      expect(store.hiddenAddresses).toEqual(
        expect.arrayContaining([
          "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
          "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
        ]),
      );
      expect(store.hiddenAddresses).toHaveLength(2);
    });

    it("should return empty array when no accounts hidden", () => {
      expect(store.hiddenAddresses).toEqual([]);
    });
  });
});
