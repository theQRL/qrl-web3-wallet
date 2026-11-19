// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyStore } from "@theqrl/web3";
import { ExtendedSeed, Seed, newMLDSA87Descriptor } from "@theqrl/wallet.js";
import { bytesToHex } from "@theqrl/web3-utils";
import type { DecryptedKey } from "@/scripts/workers/unlockWorker";
import StorageUtil from "@/utilities/storageUtil";
import LockManager from "./lockManager";

// A fast stand-in for argon2id: these tests check that every writer and
// reader agree on a password, so the cost of the real KDF adds nothing.
vi.mock("@theqrl/qrl-cryptography/argon2id.js", () => {
  const derive = (password: Uint8Array, salt: Uint8Array) =>
    new Uint8Array(createHash("sha256").update(password).update(salt).digest());
  return {
    argon2id: async (password: Uint8Array, salt: Uint8Array) =>
      derive(password, salt),
    argon2idSync: (password: Uint8Array, salt: Uint8Array) =>
      derive(password, salt),
  };
});

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      sendMessage: vi.fn(),
      connect: vi.fn(() => ({
        onDisconnect: { addListener: vi.fn() },
        disconnect: vi.fn(),
      })),
    },
    storage: {
      session: {
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: { addListener: vi.fn() },
    },
    alarms: { clear: vi.fn().mockResolvedValue(true) },
  },
}));

// Throwaway seeds, never used outside tests.
const seedFrom = (offset: number) =>
  bytesToHex(
    ExtendedSeed.newExtendedSeed(
      newMLDSA87Descriptor(),
      new Seed(Uint8Array.from({ length: 48 }, (_, i) => i + offset)),
    ).toBytes(),
  );
const SEED_A = seedFrom(1);
const SEED_B = seedFrom(33);

const PASSWORDS = [
  "pw",
  "pw\u0000",
  "pw\u0000\u0000",
  "\u0000pw",
  "\u0000\u0000pw",
  "\u0000\u0000\u0000",
  "café",
  "café",
  "lone\ud800sur",
  "päss🔐",
];


let stored: KeyStore[] = [];

type WorkerResult = {
  success: boolean;
  keys?: DecryptedKey[];
  upgradedKeystores?: KeyStore[];
  newKeystores?: KeyStore[];
  newKeys?: DecryptedKey[];
};

const runWorker = async (
  load: () => Promise<unknown>,
  data: unknown,
): Promise<WorkerResult> => {
  const scope = {
    onmessage: undefined as
      | ((event: { data: unknown }) => Promise<void>)
      | undefined,
    postMessage: vi.fn<(response: WorkerResult) => void>(),
  };
  vi.stubGlobal("self", scope);
  vi.resetModules();
  await load();
  if (!scope.onmessage) throw new Error("Worker handler was not installed");
  await scope.onmessage({ data });
  vi.unstubAllGlobals();
  return scope.postMessage.mock.calls[0][0];
};

// lockStore.unlock: the popup worker decrypts, upgrades weak vaults and hands
// the keys and the NFC password to the service worker.
const popupUnlock = async (typed: string) => {
  const result = await runWorker(
    () => import("@/scripts/workers/unlockWorker"),
    { keystores: stored, password: typed },
  );
  if (!result.success || !result.keys) return false;
  if (result.upgradedKeystores?.length) stored = result.upgradedKeystores;
  LockManager.setDecryptedKeysFromPopup({
    keys: result.keys,
    walletPassword: typed.normalize("NFC"),
  });
  return true;
};

// lockStore.changePassword
const popupChangePassword = async (
  oldPassword: string,
  newPassword: string,
) => {
  const result = await runWorker(
    () => import("@/scripts/workers/changePasswordWorker"),
    { keystores: stored, oldPassword, newPassword },
  );
  if (!result.success || !result.newKeystores || !result.newKeys) return false;
  stored = result.newKeystores;
  LockManager.setDecryptedKeysFromPopup({
    keys: result.newKeys,
    walletPassword: newPassword.normalize("NFC"),
  });
  return true;
};

const addAccount = () =>
  LockManager.encryptAccount({
    password: LockManager.getWalletPassword(),
    seed: SEED_B,
  });

const seedsAfterUnlock = async (typed: string) => {
  const ok = await popupUnlock(typed);
  const seeds = ok ? LockManager.getDecryptedKeys().map((k) => k.seed) : [];
  await LockManager.lock();
  return { ok, seeds: seeds.sort() };
};

const reset = async () => {
  await LockManager.lock();
  stored = [];
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const useMemoryKeystores = () => {
  vi.spyOn(StorageUtil, "getKeystores").mockImplementation(async () => stored);
  vi.spyOn(StorageUtil, "setKeystores").mockImplementation(async (next) => {
    stored = next;
  });
};

describe.each(
  PASSWORDS.map((password) => [JSON.stringify(password), password]),
)("password %s", (_label, password) => {
  it("creates a vault, unlocks it, adds an account and unlocks again", async () => {
    useMemoryKeystores();
    await reset();
    await LockManager.encryptAccount({ password, seed: SEED_A });
    await LockManager.lock();
    expect(await popupUnlock(password)).toBe(true);
    await addAccount();
    await LockManager.lock();
    expect(await seedsAfterUnlock(password)).toEqual({
      ok: true,
      seeds: [SEED_A, SEED_B].sort(),
    });
  }, 120000);

  it("becomes the password after a password change and unlocks again", async () => {
    useMemoryKeystores();
    await reset();
    await LockManager.encryptAccount({ password: "base-pw", seed: SEED_A });
    await LockManager.lock();
    expect(await popupUnlock("base-pw")).toBe(true);
    expect(await popupChangePassword("base-pw", password)).toBe(true);
    await LockManager.lock();
    expect(await seedsAfterUnlock(password)).toEqual({
      ok: true,
      seeds: [SEED_A],
    });
    expect((await seedsAfterUnlock("base-pw")).ok).toBe(false);
  }, 120000);
});

describe("an empty password", () => {
  const password = "";

  it("is refused for a new vault and persists no keystore", async () => {
    useMemoryKeystores();
    await reset();
    await expect(
      LockManager.encryptAccount({ password, seed: SEED_A }),
    ).rejects.toThrow("Refusing to encrypt an account without a password");
    expect(stored).toEqual([]);
  }, 120000);

  it("is refused as the new password, and the old password stays", async () => {
    useMemoryKeystores();
    await reset();
    await LockManager.encryptAccount({ password: "base-pw", seed: SEED_A });
    await LockManager.lock();
    expect(await popupUnlock("base-pw")).toBe(true);
    expect(await popupChangePassword("base-pw", password)).toBe(false);
    await LockManager.lock();
    expect(await seedsAfterUnlock("base-pw")).toEqual({
      ok: true,
      seeds: [SEED_A],
    });
  }, 120000);

});

describe("accepted passwords", () => {
  it("are the typed password only: a NUL character makes another password", async () => {
    useMemoryKeystores();
    await reset();
    await LockManager.encryptAccount({ password: "pw", seed: SEED_A });
    await LockManager.lock();
    expect((await seedsAfterUnlock("pw")).ok).toBe(true);
    expect((await seedsAfterUnlock("pw\u0000")).ok).toBe(false);
    expect((await seedsAfterUnlock("\u0000pw")).ok).toBe(false);
    expect((await seedsAfterUnlock("other")).ok).toBe(false);
  }, 120000);

  it("include the composed and the decomposed spelling of the same password", async () => {
    useMemoryKeystores();
    await reset();
    await LockManager.encryptAccount({
      password: "cafe\u0301".normalize("NFC"),
      seed: SEED_A,
    });
    await LockManager.lock();
    expect(await popupUnlock("cafe\u0301")).toBe(true);
    await addAccount();
    await LockManager.lock();
    for (const typed of ["caf\u00e9", "cafe\u0301"]) {
      expect(await seedsAfterUnlock(typed)).toEqual({
        ok: true,
        seeds: [SEED_A, SEED_B].sort(),
      });
    }
  }, 120000);
});
