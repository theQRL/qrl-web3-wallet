// @vitest-environment node
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { KeyStore } from "@theqrl/web3";
import browser from "webextension-polyfill";
import LockStore from "@/stores/lockStore";
import StorageUtil from "@/utilities/storageUtil";
import type {
  UnlockWorkerRequest,
  UnlockWorkerResponse,
} from "@/scripts/workers/unlockWorker";
import type {
  ChangePasswordWorkerRequest,
  ChangePasswordWorkerResponse,
} from "@/scripts/workers/changePasswordWorker";
import fixtures from "./fixtures/legacy-vaults.json";
import LockManager, { LOCK_MANAGER_MESSAGES } from "./lockManager";
import { decryptKeystore } from "./keystoreCompatibility";
import {
  RECOMMENDED_KEYSTORE_KDF_PARAMS,
  shouldUpgradeKeystoreParams,
} from "./keystoreParams";

vi.mock("@theqrl/qrl-cryptography/argon2id.js", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@theqrl/qrl-cryptography/argon2id.js")
  >();
  // Reuse real derivations for deterministic test salts. Each caller gets a
  // copy because the compatibility reader clears its derived key after use.
  const cache = new Map<string, Uint8Array>();
  const cacheKey = ([password, salt, ...params]: Parameters<typeof original.argon2id>) =>
    JSON.stringify([Array.from(password), Array.from(salt), ...params]);
  return {
    argon2id: async (...args: Parameters<typeof original.argon2id>) => {
      const key = cacheKey(args);
      let derived = cache.get(key);
      if (!derived) {
        derived = await original.argon2id(...args);
        cache.set(key, derived);
      }
      return derived.slice();
    },
    argon2idSync: (...args: Parameters<typeof original.argon2idSync>) => {
      const key = cacheKey(args);
      let derived = cache.get(key);
      if (!derived) {
        derived = original.argon2idSync(...args);
        cache.set(key, derived);
      }
      return derived.slice();
    },
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

const mixedVaults = [fixtures.D, fixtures.D2, fixtures.C];
const password = fixtures.C.typedPassword;
const cases = [
  { label: "D", vaults: [fixtures.D] },
  { label: "D2", vaults: [fixtures.D2] },
  { label: "D, D2 and C", vaults: mixedVaults },
];

async function runWorker<
  Request extends UnlockWorkerRequest | ChangePasswordWorkerRequest,
  Response extends UnlockWorkerResponse | ChangePasswordWorkerResponse,
>(load: () => Promise<unknown>, request: Request): Promise<Response> {
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
    if (array instanceof Uint8Array && array.length === 32) {
      array.fill(0x5a);
    } else {
      getRandomValues(array);
    }
    return array;
  });
  const scope = {
    onmessage: undefined as
      | ((event: MessageEvent<Request>) => Promise<void>)
      | undefined,
    postMessage: vi.fn<(response: Response) => void>(),
  };
  vi.stubGlobal("self", scope);
  vi.resetModules();
  await load();
  if (!scope.onmessage) throw new Error("Worker handler was not installed");
  await scope.onmessage({ data: request } as MessageEvent<Request>);
  expect(scope.postMessage).toHaveBeenCalledTimes(1);
  return scope.postMessage.mock.calls[0][0];
}

beforeEach(() => {
  vi.mocked(browser.runtime.sendMessage).mockImplementation(
    async (message: { name: string }) => {
      if (message.name === LOCK_MANAGER_MESSAGES.GET_DECRYPTED_KEYS) {
        return LockManager.getDecryptedKeys();
      }
      return { isLocked: false, hasPasswordSet: true };
    },
  );
});

afterEach(async () => {
  await LockManager.lock();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("legacy unlock and recovery", () => {
  it.each(cases)(
    "unlocks $label through LockManager and exports original phrases",
    async ({ vaults }) => {
      vi.spyOn(StorageUtil, "getKeystores").mockResolvedValue(
        vaults.map(({ keystore }) => keystore as KeyStore),
      );
      expect(await LockManager.unlock(password)).toBe(true);
      expect(LockManager.getDecryptedKeys()).toHaveLength(vaults.length);
      const store = new LockStore();

      for (const vault of vaults) {
        const key = LockManager.getDecryptedKeys().find(
          ({ address }) => address === vault.keystore.address,
        );
        expect(key?.seed).toBe(vault.expected.seed);
        if (vault !== fixtures.C) expect(key?.recoveryOnly).toBe(true);
        for (const address of [
          vault.keystore.address.toLowerCase(),
          vault.keystore.address.toUpperCase(),
        ]) {
          expect(await store.getMnemonicPhrases(address)).toBe(
            vault.expected.mnemonic,
          );
          await expect(store.getAccountSeed(address)).rejects.toThrow(
            vault === fixtures.C
              ? "legacy 20-byte address"
              : "this wallet version cannot read",
          );
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    },
    30000,
  );

  it("clears all keys when one vault fails AES authentication", async () => {
    const tampered = structuredClone(fixtures.D.keystore) as KeyStore;
    const ciphertext = tampered.crypto.ciphertext;
    tampered.crypto.ciphertext =
      ciphertext.slice(0, -2) + (ciphertext.endsWith("00") ? "01" : "00");
    vi.spyOn(StorageUtil, "getKeystores").mockResolvedValue([
      fixtures.C.keystore as KeyStore,
    ]);
    expect(await LockManager.unlock(password)).toBe(true);
    vi.mocked(StorageUtil.getKeystores).mockResolvedValue([
      fixtures.C.keystore as KeyStore,
      tampered,
    ]);
    expect(await LockManager.unlock(password)).toBe(false);
    expect(() => LockManager.getDecryptedKeys()).toThrow("locked");
  }, 30000);

  it.each(cases)(
    "unlocks and upgrades $label through the popup worker",
    async ({ vaults }) => {
      const keystores = vaults.map(({ keystore }) => keystore as KeyStore);
      const result = await runWorker<UnlockWorkerRequest, UnlockWorkerResponse>(
        () => import("../workers/unlockWorker"),
        { keystores, password },
      );
      expect(result.success).toBe(true);
      if (!result.success) throw new Error("Unlock failed");
      expect(result.keys).toHaveLength(vaults.length);
      expect(result.upgradedKeystores).toHaveLength(vaults.length);
      for (const [index, vault] of vaults.entries()) {
        expect(result.keys[index]).toMatchObject({
          address: vault.keystore.address,
          seed: vault.expected.seed,
          mnemonicPhrases: vault.expected.mnemonic,
        });
        if (vault !== fixtures.C)
          expect(result.keys[index].recoveryOnly).toBe(true);
        const upgraded = result.upgradedKeystores?.[index];
        expect(upgraded?.address).toBe(vault.keystore.address);
        expect(upgraded?.crypto.kdfparams).toMatchObject(
          RECOMMENDED_KEYSTORE_KDF_PARAMS,
        );
        expect(shouldUpgradeKeystoreParams(upgraded)).toBe(false);
        expect(upgraded?.crypto.cipherparams.iv).not.toBe(
          vault.keystore.crypto.cipherparams.iv,
        );
        expect(upgraded?.crypto.kdfparams.salt).not.toBe(
          vault.keystore.crypto.kdfparams.salt,
        );
        if (!upgraded) throw new Error("Missing upgraded account");
        expect(await decryptKeystore(upgraded, password)).toMatchObject({
          address: vault.keystore.address,
          seed: vault.expected.seed,
          ...(vault === fixtures.C ? {} : { recoveryOnly: true }),
        });
      }
    },
    180000,
  );

  it("rejects an incorrect worker password without returning partial keys", async () => {
    const result = await runWorker<UnlockWorkerRequest, UnlockWorkerResponse>(
      () => import("../workers/unlockWorker"),
      {
        keystores: mixedVaults.map(({ keystore }) => keystore as KeyStore),
        password: "wrong password",
      },
    );
    expect(result).toEqual({ success: false });
  }, 30000);
});

describe("legacy password changes", () => {
  const newPassword = "new test-only password\u0000";
  let result: ChangePasswordWorkerResponse;

  beforeAll(async () => {
    result = await runWorker<
      ChangePasswordWorkerRequest,
      ChangePasswordWorkerResponse
    >(() => import("../workers/changePasswordWorker"), {
      keystores: mixedVaults.map(({ keystore }) => keystore as KeyStore),
      oldPassword: password,
      newPassword,
    });
  }, 180000);

  it("keeps every account and its recovery metadata", () => {
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Password change failed");
    expect(result.newKeystores.map(({ address }) => address)).toEqual(
      mixedVaults.map(({ keystore }) => keystore.address),
    );
    expect(result.newKeys).toEqual(
      mixedVaults.map((vault) => ({
        address: vault.keystore.address,
        seed: vault.expected.seed,
        mnemonicPhrases: vault.expected.mnemonic,
        ...(vault === fixtures.C ? {} : { recoveryOnly: true }),
      })),
    );
  });

  it.each(mixedVaults)(
    "decrypts $label with the changed password",
    async (vault) => {
      if (!result.success) throw new Error("Password change failed");
      const keystore = result.newKeystores.find(
        ({ address }) => address === vault.keystore.address,
      );
      if (!keystore) throw new Error("Missing re-encrypted account");
      expect(shouldUpgradeKeystoreParams(keystore)).toBe(false);
      expect(await decryptKeystore(keystore, newPassword)).toMatchObject({
        address: vault.keystore.address,
        seed: vault.expected.seed,
        ...(vault === fixtures.C ? {} : { recoveryOnly: true }),
      });
    },
    180000,
  );

  it("rejects the previous password after re-encryption", async () => {
    if (!result.success) throw new Error("Password change failed");
    await expect(
      decryptKeystore(result.newKeystores[0], password),
    ).rejects.toThrow();
  }, 180000);

  it("rejects a wrong old password without returning new keystores", async () => {
    const failed = await runWorker<
      ChangePasswordWorkerRequest,
      ChangePasswordWorkerResponse
    >(() => import("../workers/changePasswordWorker"), {
      keystores: mixedVaults.map(({ keystore }) => keystore as KeyStore),
      oldPassword: "wrong password",
      newPassword,
    });
    expect(failed).toEqual({ success: false });
  }, 30000);
});
