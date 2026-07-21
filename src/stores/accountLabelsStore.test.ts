import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import AccountLabelsStore from "./accountLabelsStore";

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

describe("AccountLabelsStore", () => {
  let store: AccountLabelsStore;
  const noLedger = () => false;

  beforeEach(() => {
    for (const k of Object.keys(localStore)) delete localStore[k];
    store = new AccountLabelsStore();
  });

  describe("loadLabels", () => {
    it("should load labels from storage", async () => {
      localStore["ACCOUNT_LABELS"] = {
        Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: "Account 1",
      };

      await store.loadLabels();

      expect(store.labels).toEqual({
        Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: "Account 1",
      });
      expect(store.isLoading).toBe(false);
    });

    it("should return empty object when no labels in storage", async () => {
      await store.loadLabels();

      expect(store.labels).toEqual({});
      expect(store.isLoading).toBe(false);
    });
  });

  describe("syncLabels", () => {
    it("should auto-generate labels for new accounts", async () => {
      const accounts = [
        { accountAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000" },
        { accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000" },
      ];

      await store.syncLabels(accounts, noLedger);

      expect(store.getLabel("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000")).toBe(
        "Account 1",
      );
      expect(store.getLabel("Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000")).toBe(
        "Account 2",
      );
    });

    it("should label Ledger accounts with 'Ledger' prefix", async () => {
      const accounts = [
        { accountAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000" },
        { accountAddress: "Q0000000000000000000000000000000000000000000000000000000030aA00aA0a0000A00A000A0A00aa00000A00000c00000000000000000000000000000000" },
      ];
      const isLedger = (addr: string) =>
        addr === "Q0000000000000000000000000000000000000000000000000000000030aA00aA0a0000A00A000A0A00aa00000A00000c00000000000000000000000000000000";

      await store.syncLabels(accounts, isLedger);

      expect(store.getLabel("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000")).toBe(
        "Account 1",
      );
      expect(store.getLabel("Q0000000000000000000000000000000000000000000000000000000030aA00aA0a0000A00A000A0A00aa00000A00000c00000000000000000000000000000000")).toBe(
        "Ledger 1",
      );
    });

    it("should avoid number collisions with existing labels", async () => {
      // Pre-seed: "Account 2" already taken
      localStore["ACCOUNT_LABELS"] = {
        Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000: "Account 2",
      };

      const accounts = [
        { accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000" },
        { accountAddress: "Q0000000000000000000000000000000000000000000000000000000030aA00aA0a0000A00A000A0A00aa00000A00000c00000000000000000000000000000000" },
      ];

      await store.syncLabels(accounts, noLedger);

      // Existing label preserved
      expect(store.getLabel("Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000")).toBe(
        "Account 2",
      );
      // New account gets "Account 1" (not "Account 2" which is taken)
      expect(store.getLabel("Q0000000000000000000000000000000000000000000000000000000030aA00aA0a0000A00A000A0A00aa00000A00000c00000000000000000000000000000000")).toBe(
        "Account 1",
      );
    });

    it("should persist labels to storage when new labels are generated", async () => {
      const accounts = [
        { accountAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000" },
      ];

      await store.syncLabels(accounts, noLedger);

      expect(localStore["ACCOUNT_LABELS"]).toEqual({
        Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: "Account 1",
      });
    });

    it("should not write to storage if no new labels needed", async () => {
      localStore["ACCOUNT_LABELS"] = {
        Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: "Account 1",
      };

      const accounts = [
        { accountAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000" },
      ];

      const browser = (await import("webextension-polyfill")).default;
      const setCalls = (browser.storage.local.set as Mock).mock.calls
        .length;

      await store.syncLabels(accounts, noLedger);

      // set should not be called again since label already exists
      expect(
        (browser.storage.local.set as Mock).mock.calls.length,
      ).toBe(setCalls);
    });

    it("should preserve existing labels on sync", async () => {
      localStore["ACCOUNT_LABELS"] = {
        Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: "My Main",
      };

      const accounts = [
        { accountAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000" },
        { accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000" },
      ];

      await store.syncLabels(accounts, noLedger);

      expect(store.getLabel("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000")).toBe(
        "My Main",
      );
      expect(store.getLabel("Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000")).toBe(
        "Account 1",
      );
    });
  });

  describe("setLabel", () => {
    it("should update a single label", async () => {
      store.labels = {
        Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: "Account 1",
      };

      await store.setLabel(
        "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
        "My Wallet",
      );

      expect(store.getLabel("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000")).toBe(
        "My Wallet",
      );
    });

    it("should persist the updated label to storage", async () => {
      store.labels = {
        Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: "Account 1",
      };

      await store.setLabel(
        "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
        "My Wallet",
      );

      expect(localStore["ACCOUNT_LABELS"]).toEqual({
        Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: "My Wallet",
      });
    });

    it("should preserve other labels when updating one", async () => {
      store.labels = {
        Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: "Account 1",
        Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000: "Account 2",
      };

      await store.setLabel(
        "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
        "My Wallet",
      );

      expect(store.getLabel("Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000")).toBe(
        "Account 2",
      );
    });
  });

  describe("getLabel", () => {
    it("should return label for known address", () => {
      store.labels = {
        Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: "Account 1",
      };

      expect(store.getLabel("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000")).toBe(
        "Account 1",
      );
    });

    it("should return empty string for unknown address", () => {
      expect(store.getLabel("Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000")).toBe(
        "",
      );
    });
  });

  describe("clearLabels", () => {
    it("should clear all labels from store and storage", async () => {
      store.labels = {
        Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: "Account 1",
      };
      localStore["ACCOUNT_LABELS"] = {
        Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: "Account 1",
      };

      await store.clearLabels();

      expect(store.labels).toEqual({});
      expect(localStore["ACCOUNT_LABELS"]).toBeUndefined();
    });
  });
});
