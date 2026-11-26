import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

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
    runtime: {
      sendMessage: vi.fn(() => Promise.resolve()),
    },
    alarms: {
      create: vi.fn(() => Promise.resolve()),
      clear: vi.fn(() => Promise.resolve(true)),
    },
  },
}));

import browser from "webextension-polyfill";
import SettingsStore from "./settingsStore";
import StorageUtil from "@/utilities/storageUtil";

const mockSendMessage = browser.runtime.sendMessage as Mock;

describe("SettingsStore", () => {
  let store: SettingsStore;

  beforeEach(() => {
    for (const k of Object.keys(localStore)) delete localStore[k];

    // Provide minimal DOM stubs for the constructor
    const root = document.documentElement;
    root.classList.remove("dark", "light");

    store = new SettingsStore();
  });

  it("should initialize with default values", () => {
    expect(store.themePreference).toBe("system");
    expect(store.autoLockMinutes).toBe(15);
    expect(store.currency).toBe("USD");
    expect(store.language).toBe("en");
  });

  it("recognizes a marked action popup before its viewport is measured", () => {
    const originalUrl = window.location.href;
    try {
      window.history.replaceState(null, "", "?actionPopup=1");
      expect(new SettingsStore().isPopupWindow).toBe(true);
    } finally {
      window.history.replaceState(null, "", originalUrl);
    }
  });

  it("should have a theme based on system preference", () => {
    expect(["dark", "light"]).toContain(store.theme);
    expect(typeof store.isDarkMode).toBe("boolean");
  });

  describe("setThemePreference", () => {
    it("should update themePreference to light", async () => {
      await store.setThemePreference("light");

      expect(store.themePreference).toBe("light");
      expect(store.theme).toBe("light");
      expect(store.isDarkMode).toBe(false);
    });

    it("should update themePreference to dark", async () => {
      await store.setThemePreference("dark");

      expect(store.themePreference).toBe("dark");
      expect(store.theme).toBe("dark");
      expect(store.isDarkMode).toBe(true);
    });

    it("should persist the preference to storage", async () => {
      await store.setThemePreference("dark");

      const settings = await StorageUtil.getSettings();
      expect(settings.themePreference).toBe("dark");
    });

    it("should update themePreference to system", async () => {
      await store.setThemePreference("dark");
      await store.setThemePreference("system");

      expect(store.themePreference).toBe("system");
      expect(["dark", "light"]).toContain(store.theme);
    });
  });

  describe("setAutoLockMinutes", () => {
    it("should update autoLockMinutes", async () => {
      await store.setAutoLockMinutes(5);

      expect(store.autoLockMinutes).toBe(5);
    });

    it("should persist to storage", async () => {
      await store.setAutoLockMinutes(30);

      const settings = await StorageUtil.getSettings();
      expect(settings.autoLockMinutes).toBe(30);
    });

    it("should allow setting to 0 (never)", async () => {
      await store.setAutoLockMinutes(0);

      expect(store.autoLockMinutes).toBe(0);

      const settings = await StorageUtil.getSettings();
      expect(settings.autoLockMinutes).toBe(0);
    });

    it("should send UPDATE_AUTO_LOCK message to service worker", async () => {
      await store.setAutoLockMinutes(10);

      expect(mockSendMessage).toHaveBeenCalledWith({
        name: "LOCK_MANAGER_UPDATE_AUTO_LOCK",
      });
    });

    it("should not throw if sendMessage fails", async () => {
      (mockSendMessage as Mock<() => Promise<any>>).mockRejectedValueOnce(new Error("SW not ready"));

      await expect(store.setAutoLockMinutes(5)).resolves.not.toThrow();
      expect(store.autoLockMinutes).toBe(5);
    });
  });

  describe("setCurrency", () => {
    it("should update currency", async () => {
      await store.setCurrency("EUR");

      expect(store.currency).toBe("EUR");
    });

    it("should persist to storage", async () => {
      await store.setCurrency("PLN");

      const settings = await StorageUtil.getSettings();
      expect(settings.currency).toBe("PLN");
    });
  });

  describe("setLanguage", () => {
    it("should update language", async () => {
      await store.setLanguage("pl");

      expect(store.language).toBe("pl");
    });

    it("should persist to storage", async () => {
      await store.setLanguage("de");

      const settings = await StorageUtil.getSettings();
      expect(settings.language).toBe("de");
    });
  });

  describe("loadSettings (via constructor)", () => {
    it("should load persisted settings on construction", async () => {
      await StorageUtil.setSettings({
        themePreference: "dark",
        autoLockMinutes: 30,
        currency: "GBP",
        language: "fr",
      });

      const newStore = new SettingsStore();

      // Wait for async loadSettings to complete
      await new Promise((r) => setTimeout(r, 50));

      expect(newStore.themePreference).toBe("dark");
      expect(newStore.autoLockMinutes).toBe(30);
      expect(newStore.currency).toBe("GBP");
      expect(newStore.language).toBe("fr");
    });

    it("should keep defaults when no settings in storage", async () => {
      const newStore = new SettingsStore();

      await new Promise((r) => setTimeout(r, 50));

      expect(newStore.themePreference).toBe("system");
      expect(newStore.autoLockMinutes).toBe(15);
      expect(newStore.currency).toBe("USD");
      expect(newStore.language).toBe("en");
    });
  });
});
