// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Web3 from "@theqrl/web3";
import { runInAction } from "mobx";
import { QRL_EXAMPLE_ADDRESS } from "@/constants/address";
import StorageUtil from "@/utilities/storageUtil";
import QrlStore from "./qrlStore";

describe("QrlStore account balances", () => {
  beforeEach(() => {
    vi.spyOn(QrlStore.prototype, "initializeBlockchain").mockResolvedValue();
  });

  afterEach(() => vi.restoreAllMocks());

  it("isolates a rejected balance request from the remaining accounts", async () => {
    const failedAddress = `Q${"ab".repeat(64)}`;
    vi.spyOn(StorageUtil, "getAllAccounts").mockResolvedValue([
      failedAddress,
      QRL_EXAMPLE_ADDRESS,
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
    expect(store.getAccountBalance(QRL_EXAMPLE_ADDRESS)).toBe("12.5 QRL");
    expect(store.qrlAccounts.isLoading).toBe(false);
  });
});
