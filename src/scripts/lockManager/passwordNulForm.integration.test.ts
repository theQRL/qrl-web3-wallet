// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyStore } from "@theqrl/web3";
import { ExtendedSeed, Seed, newMLDSA87Descriptor } from "@theqrl/wallet.js";
import { bytesToHex } from "@theqrl/web3-utils";
import StorageUtil from "@/utilities/storageUtil";
import type {
  ChangePasswordWorkerRequest,
  ChangePasswordWorkerResponse,
} from "@/scripts/workers/changePasswordWorker";
import LockManager from "./lockManager";

// A fast stand-in for argon2id: the test is about which password bytes are
// used, not about the KDF cost.
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
const SEEDS = [seedFrom(1), seedFrom(33), seedFrom(65)];

const useMemoryKeystores = () => {
  let stored: KeyStore[] = [];
  vi.spyOn(StorageUtil, "getKeystores").mockImplementation(async () => stored);
  vi.spyOn(StorageUtil, "setKeystores").mockImplementation(async (next) => {
    stored = next;
  });
  return {
    get: () => stored,
    set: (next: KeyStore[]) => {
      stored = next;
    },
  };
};

const unlocksWith = async (password: string) => {
  const ok = await LockManager.unlock(password);
  const seeds = ok ? LockManager.getDecryptedKeys().map((k) => k.seed) : [];
  await LockManager.lock();
  return { ok, seeds };
};

afterEach(async () => {
  await LockManager.lock();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("passwords with NUL edge characters", () => {
  it("keeps one password form through unlock, add account and the next unlock", async () => {
    useMemoryKeystores();
    await LockManager.encryptAccount({ password: "pw", seed: SEEDS[0] });
    await LockManager.lock();

    // As on 1.x, a trailing NUL still opens the vault ...
    expect(await LockManager.unlock("pw\u0000")).toBe(true);
    // ... and the session keeps the stripped form.
    expect(LockManager.getWalletPassword()).toBe("pw");

    // The popup adds an account with the session password, and another with
    // the typed form.
    await LockManager.encryptAccount({
      password: LockManager.getWalletPassword(),
      seed: SEEDS[1],
    });
    await LockManager.encryptAccount({
      password: "pw\u0000",
      seed: SEEDS[2],
    });
    await LockManager.lock();

    for (const typed of ["pw", "pw\u0000", "\u0000pw"]) {
      const { ok, seeds } = await unlocksWith(typed);
      expect(ok).toBe(true);
      expect(seeds.sort()).toEqual([...SEEDS].sort());
    }
    expect((await unlocksWith("other")).ok).toBe(false);
  }, 120000);

  it("stores the stripped form when the popup sends the typed password", async () => {
    useMemoryKeystores();
    LockManager.setDecryptedKeysFromPopup({
      keys: [],
      walletPassword: "pw\u0000",
    });
    expect(LockManager.getWalletPassword()).toBe("pw");
  });

  it("re-encrypts with the stripped form when the password is changed", async () => {
    const keystores = useMemoryKeystores();
    await LockManager.encryptAccount({ password: "old", seed: SEEDS[0] });
    const scope = {
      onmessage: undefined as
        | ((event: MessageEvent<ChangePasswordWorkerRequest>) => Promise<void>)
        | undefined,
      postMessage: vi.fn<(response: ChangePasswordWorkerResponse) => void>(),
    };
    vi.stubGlobal("self", scope);
    vi.resetModules();
    await import("@/scripts/workers/changePasswordWorker");
    if (!scope.onmessage) throw new Error("Worker handler was not installed");
    await scope.onmessage({
      data: {
        keystores: keystores.get(),
        oldPassword: "old\u0000",
        newPassword: "new\u0000",
      },
    } as MessageEvent<ChangePasswordWorkerRequest>);
    const response = scope.postMessage.mock.calls[0][0];
    if (!response.success) throw new Error("Password change failed");
    keystores.set(response.newKeystores);

    for (const typed of ["new", "new\u0000"]) {
      const { ok, seeds } = await unlocksWith(typed);
      expect(ok).toBe(true);
      expect(seeds).toEqual([SEEDS[0]]);
    }
  }, 120000);
});
