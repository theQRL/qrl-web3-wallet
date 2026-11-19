// @vitest-environment node
import { createHash } from "node:crypto";
import type { KeyStore } from "@theqrl/web3";
import { ExtendedSeed, Seed, newMLDSA87Descriptor } from "@theqrl/wallet.js";
import { decrypt, encrypt } from "@theqrl/web3-qrl-accounts";
import { bytesToHex } from "@theqrl/web3-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangePasswordWorkerResponse } from "./changePasswordWorker";
import { encryptVerified } from "./encryptVerified";
import type { UnlockWorkerResponse } from "./unlockWorker";

// What the next keystore writer does wrong, if anything.
const fault = vi.hoisted(() => ({
  seed: undefined as string | undefined,
  password: undefined as string | undefined,
  fails: false,
}));

// A fast stand-in for argon2id: these tests check what is written and read
// back, so the cost of the real KDF adds nothing.
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

// The real library, with a writer that can be made to encrypt another seed,
// to encrypt under another password, or to fail.
vi.mock("@theqrl/web3-qrl-accounts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@theqrl/web3-qrl-accounts")>();
  const faultyEncrypt: typeof actual.encrypt = async (
    seed,
    password,
    options,
  ) => {
    if (fault.fails) throw new Error("The writer failed");
    return actual.encrypt(
      fault.seed ?? seed,
      fault.password ?? password,
      options,
    );
  };
  return { ...actual, encrypt: faultyEncrypt };
});

// Throwaway seeds, never used outside tests.
const seedFrom = (offset: number) =>
  bytesToHex(
    ExtendedSeed.newExtendedSeed(
      newMLDSA87Descriptor(),
      new Seed(Uint8Array.from({ length: 48 }, (_, i) => i + offset)),
    ).toBytes(),
  );
const SEED = seedFrom(1);
const OTHER_SEED = seedFrom(33);
const PASSWORD = "correct horse";
const WEAK_PARAMS = { m: 19456, t: 2, p: 1, dklen: 32 };

const accountOf = async (seed: string) => {
  const { address } = await decrypt(await encrypt(seed, PASSWORD), PASSWORD);
  return { address, seed };
};

const runWorker = async <Response>(
  load: () => Promise<unknown>,
  data: unknown,
): Promise<Response> => {
  const scope = {
    onmessage: undefined as
      | ((event: { data: unknown }) => Promise<void>)
      | undefined,
    postMessage: vi.fn<(response: Response) => void>(),
  };
  vi.stubGlobal("self", scope);
  vi.resetModules();
  await load();
  if (!scope.onmessage) throw new Error("Worker handler was not installed");
  await scope.onmessage({ data });
  vi.unstubAllGlobals();
  return scope.postMessage.mock.calls[0][0];
};

const changePassword = (keystores: KeyStore[], newPassword: string) =>
  runWorker<ChangePasswordWorkerResponse>(
    () => import("./changePasswordWorker"),
    { keystores, oldPassword: PASSWORD, newPassword },
  );

const unlock = (keystores: KeyStore[]) =>
  runWorker<UnlockWorkerResponse>(() => import("./unlockWorker"), {
    keystores,
    password: PASSWORD,
  });

afterEach(() => {
  fault.seed = undefined;
  fault.password = undefined;
  fault.fails = false;
  vi.unstubAllGlobals();
});

describe("encryptVerified", () => {
  it("returns a keystore that opens with the password to the same account", async () => {
    const account = await accountOf(SEED);

    const keystore = await encryptVerified(account, "new password");

    expect(await decrypt(keystore, "new password")).toMatchObject(account);
  });

  it("refuses a keystore that reads back to another seed", async () => {
    const account = await accountOf(SEED);
    fault.seed = OTHER_SEED;

    await expect(encryptVerified(account, "new password")).rejects.toThrow(
      "The rewritten keystore does not read back to the account",
    );
  });

  it("refuses a keystore that does not open with the password", async () => {
    const account = await accountOf(SEED);
    fault.password = "another password";

    await expect(encryptVerified(account, "new password")).rejects.toThrow();
  });

  it("refuses an account whose address is not the seed's", async () => {
    const { address } = await accountOf(OTHER_SEED);

    await expect(
      encryptVerified({ address, seed: SEED }, "new password"),
    ).rejects.toThrow(
      "The rewritten keystore does not read back to the account",
    );
  });
});

describe("a password change", () => {
  it("returns keystores that open with the new password", async () => {
    const stored = [await encrypt(SEED, PASSWORD)];

    const result = await changePassword(stored, "new password");

    if (!result.success) throw new Error("The password change failed");
    expect(result.newKeys.map((key) => key.seed)).toEqual([SEED]);
    expect((await decrypt(result.newKeystores[0], "new password")).seed).toBe(
      SEED,
    );
  });

  it.each([
    ["reads back to another seed", { seed: OTHER_SEED }],
    ["does not open with the new password", { password: "another password" }],
  ])("returns no keystore when the new one %s", async (_label, wrong) => {
    const stored = [await encrypt(SEED, PASSWORD)];
    Object.assign(fault, wrong);

    expect(await changePassword(stored, "new password")).toEqual({
      success: false,
    });
  });
});

describe("the upgrade of a weak keystore at unlock", () => {
  it("returns the upgraded keystore once it reads back", async () => {
    const weak = await encrypt(SEED, PASSWORD, WEAK_PARAMS);

    const result = await unlock([weak]);

    if (!result.success) throw new Error("The unlock failed");
    expect(result.keys.map((key) => key.seed)).toEqual([SEED]);
    expect(result.upgradedKeystores).toHaveLength(1);
    const [upgraded] = result.upgradedKeystores ?? [];
    expect(upgraded).not.toEqual(weak);
    expect((await decrypt(upgraded, PASSWORD)).seed).toBe(SEED);
  });

  it.each([
    ["reads back to another seed", { seed: OTHER_SEED }],
    ["does not open with the password", { password: "another password" }],
    ["cannot be written", { fails: true }],
  ])(
    "unlocks and keeps the stored keystore when the upgrade %s",
    async (_label, wrong) => {
      const weak = await encrypt(SEED, PASSWORD, WEAK_PARAMS);
      Object.assign(fault, wrong);

      const result = await unlock([weak]);

      if (!result.success) throw new Error("The unlock failed");
      expect(result.keys.map((key) => key.seed)).toEqual([SEED]);
      expect(result.upgradedKeystores).toBeUndefined();
    },
  );

  it("upgrades the keystores that read back and keeps the one that does not", async () => {
    const weakA = await encrypt(SEED, PASSWORD, WEAK_PARAMS);
    const weakB = await encrypt(OTHER_SEED, PASSWORD, WEAK_PARAMS);
    // Every upgrade is written for the first seed, so the second one's does
    // not read back to its account.
    fault.seed = SEED;

    const result = await unlock([weakA, weakB]);

    if (!result.success) throw new Error("The unlock failed");
    expect(result.keys.map((key) => key.seed)).toEqual([SEED, OTHER_SEED]);
    const [upgradedA, keptB] = result.upgradedKeystores ?? [];
    expect((await decrypt(upgradedA, PASSWORD)).seed).toBe(SEED);
    expect(upgradedA).not.toEqual(weakA);
    expect(keptB).toEqual(weakB);
  });

  it("leaves a keystore with current parameters as it is", async () => {
    const current = await encrypt(SEED, PASSWORD);

    const result = await unlock([current]);

    if (!result.success) throw new Error("The unlock failed");
    expect(result.upgradedKeystores).toBeUndefined();
  });
});
