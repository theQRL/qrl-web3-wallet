// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Web3 from "@theqrl/web3";
import { runInAction } from "mobx";
import fixtures from "@/scripts/lockManager/fixtures/legacy-vaults.json";
import StorageUtil from "@/utilities/storageUtil";
import { LEGACY_ACCOUNT_RECOVERY_MESSAGE } from "@/utilities/addressUtil";
import QrlStore from "./qrlStore";

const modernAddress = new Web3().qrl.accounts.seedToAccount(
  fixtures.C.expected.seed,
).address;

describe("QrlStore account balances", () => {
  beforeEach(() => {
    vi.spyOn(QrlStore.prototype, "initializeBlockchain").mockResolvedValue();
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([
    fixtures.C.keystore.address,
    fixtures.C.keystore.address.toLowerCase(),
  ])(
    "keeps the 64-byte balance when %s is stored first",
    async (legacyAddress) => {
      vi.spyOn(StorageUtil, "getAllAccounts").mockResolvedValue([
        legacyAddress,
        modernAddress,
      ]);
      const qrl = new Web3().qrl;
      const getBalance = vi
        .spyOn(qrl, "getBalance")
        .mockResolvedValue(12500000000000000000n);
      const store = new QrlStore();
      runInAction(() => {
        store.qrlInstance = qrl;
      });

      await store.fetchAccounts();

      expect(getBalance).toHaveBeenCalledExactlyOnceWith(modernAddress);
      expect(store.qrlAccounts).toEqual({
        accounts: [
          { accountAddress: legacyAddress, accountBalance: "Unavailable" },
          { accountAddress: modernAddress, accountBalance: "12.5 QRL" },
        ],
        isLoading: false,
      });
      expect(store.getAccountBalance(modernAddress)).toBe("12.5 QRL");
      expect(store.getAccountBalance(legacyAddress)).toBe("Unavailable");
    },
  );

  it("isolates a rejected balance request from the remaining accounts", async () => {
    const failedAddress = `Q${"ab".repeat(64)}`;
    vi.spyOn(StorageUtil, "getAllAccounts").mockResolvedValue([
      failedAddress,
      modernAddress,
    ]);
    const qrl = new Web3().qrl;
    vi.spyOn(qrl, "getBalance")
      .mockRejectedValueOnce(new Error("RPC request failed"))
      .mockResolvedValueOnce(12500000000000000000n);
    const store = new QrlStore();
    runInAction(() => {
      store.qrlInstance = qrl;
    });

    await store.fetchAccounts();

    expect(store.getAccountBalance(failedAddress)).toBe("Unavailable");
    expect(store.getAccountBalance(modernAddress)).toBe("12.5 QRL");
    expect(store.qrlAccounts.isLoading).toBe(false);
  });

  it("avoids token balance and NFT queries for a legacy active account", async () => {
    const qrl = new Web3().qrl;
    const createContract = vi.spyOn(qrl, "Contract");
    const store = new QrlStore();
    runInAction(() => {
      store.qrlInstance = qrl;
      store.activeAccount = { accountAddress: fixtures.D.keystore.address };
    });

    expect(await store.getZrc20TokenDetails(modernAddress)).toEqual({
      token: undefined,
      error: LEGACY_ACCOUNT_RECOVERY_MESSAGE,
    });
    expect(await store.getNftCollectionDetails(modernAddress)).toEqual({
      collection: undefined,
      error: LEGACY_ACCOUNT_RECOVERY_MESSAGE,
    });
    expect(await store.getOwnedNftTokenIds(modernAddress)).toEqual([]);
    expect(createContract).not.toHaveBeenCalled();
  });
});
