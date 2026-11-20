// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Web3, { qrl as qrlLibrary } from "@theqrl/web3";
import { hexToBytes } from "@theqrl/web3-utils";
import { runInAction } from "mobx";
import { QRL_EXAMPLE_ADDRESS } from "@/constants/address";
import StorageUtil from "@/utilities/storageUtil";
import type { TransactionHistoryEntry } from "@/types/transactionHistory";
import QrlStore, { BALANCE_UNAVAILABLE } from "./qrlStore";

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

    expect(store.getAccountBalance(failedAddress)).toBe(BALANCE_UNAVAILABLE);
    expect(store.getAccountBalance(QRL_EXAMPLE_ADDRESS)).toBe("12.5 QRL");
    expect(store.qrlAccounts.isLoading).toBe(false);
  });
});

describe("QrlStore token amounts", () => {
  beforeEach(() => {
    vi.spyOn(QrlStore.prototype, "initializeBlockchain").mockResolvedValue();
  });

  afterEach(() => vi.restoreAllMocks());

  const token = `Q${"ef".repeat(64)}`;
  const to = `Q${"cd".repeat(64)}`;

  // The library sends a contract call's data as `input`.
  const callDataOf = (transaction: unknown) => {
    if (typeof transaction !== "object" || transaction === null) {
      return undefined;
    }
    if ("input" in transaction && typeof transaction.input === "string") {
      return transaction.input;
    }
    if ("data" in transaction && typeof transaction.data === "string") {
      return transaction.data;
    }
    return undefined;
  };

  const storeOnMockNode = () => {
    // The call data of every gas estimate the node was asked for.
    const estimated: string[] = [];
    const { qrl } = new Web3({
      request: async ({
        method,
        params,
      }: {
        method: string;
        params?: unknown;
      }) => {
        if (method === "qrl_chainId") return "0x301825";
        if (method === "net_version") return "3151909";
        if (method === "qrl_getTransactionCount") return "0x3";
        if (method === "qrl_estimateGas") {
          const [transaction]: unknown[] = Array.isArray(params) ? params : [];
          const callData = callDataOf(transaction);
          if (callData !== undefined) estimated.push(callData);
          return "0x5208";
        }
        throw new Error(`unexpected ${method}`);
      },
    });
    vi.spyOn(QrlStore.prototype, "getGasFeeData").mockResolvedValue({
      baseFeePerGas: 100n,
      maxPriorityFeePerGas: 100n,
      maxFeePerGas: 200n,
    });
    const store = new QrlStore();
    runInAction(() => {
      store.qrlInstance = qrl;
    });
    return { store, qrl, estimated };
  };

  // transfer(address,uint256): the amount is the last 32 bytes of the call.
  const amountIn = (data: string | undefined) =>
    BigInt(`0x${(data ?? "").slice(-64)}`);

  it.each([
    [1.1, 18, 1100000000000000000n],
    [0.07, 2, 7n],
    [4.35, 2, 435n],
    [2.5, 18, 2500000000000000000n],
    // The send form hands the amount over as the text that was typed.
    ["1.1", 18, 1100000000000000000n],
    ["1.123456789012345678", 18, 1123456789012345678n],
  ])(
    "signs a transfer of %j with %d decimals for exactly %d base units",
    async (value, decimals, expected) => {
      const { store, qrl } = storeOnMockNode();
      // A throwaway account, made for this test run.
      const account = qrl.accounts.create();

      const result = await store.signQrc20Token(
        account.address,
        to,
        value,
        account.seed,
        token,
        decimals,
      );

      expect(result.error).toBe("");
      expect(amountIn(result.data)).toBe(expected);
      expect(result.rawTransaction).toMatch(/^0x02/);
    },
  );

  it("signs nothing for an amount with more decimal places than the token has", async () => {
    const { store, qrl } = storeOnMockNode();
    const account = qrl.accounts.create();

    const result = await store.signQrc20Token(
      account.address,
      to,
      1.234,
      account.seed,
      token,
      2,
    );

    expect(result.error).toContain("The amount has more than 2 decimal places");
    expect(result.rawTransaction).toBeUndefined();
  });

  it.each([
    [1.1, 18, 1100000000000000000n],
    [0.07, 2, 7n],
    // The fee selector passes the field's text while the user types.
    ["1.5", 18, 1500000000000000000n],
    ["0.07", 2, 7n],
  ])(
    "estimates gas for a transfer of %j with %d decimals with exactly %d base units",
    async (value, decimals, expected) => {
      const { store, estimated } = storeOnMockNode();
      const from = `Q${"ab".repeat(64)}`;

      await store.getQrc20TokenGas(from, to, value, token, decimals);

      expect(estimated.map(amountIn)).toEqual([expected]);
    },
  );

  // The value of a signed transaction, read back from its raw form.
  const valueIn = (rawTransaction: string | undefined) =>
    BigInt(
      qrlLibrary.accounts.TransactionFactory.fromSerializedData(
        hexToBytes(rawTransaction ?? ""),
      ).toJSON().value ?? "0x0",
    );

  it.each([
    ["1.1", 1100000000000000000n],
    ["0.123456789012345678", 123456789012345678n],
    // Below 0.000001 the library's own conversion refuses the number.
    ["0.0000001", 100000000000n],
    [0.0000001, 100000000000n],
    [2.5, 2500000000000000000n],
  ])(
    "signs a native transfer of %j quanta for exactly %d planck",
    async (value, expected) => {
      const { store, qrl } = storeOnMockNode();
      const account = qrl.accounts.create();

      const result = await store.signNativeToken(
        account.address,
        to,
        value,
        account.seed,
      );

      expect(result.error).toBe("");
      expect(result.value).toBe(expected.toString());
      expect(valueIn(result.rawTransaction)).toBe(expected);
    },
  );

  const pendingTransfer = (
    from: string,
    fields: Partial<TransactionHistoryEntry>,
  ): TransactionHistoryEntry => ({
    id: "0xoriginal",
    from,
    to,
    amount: 0,
    tokenSymbol: "QRL",
    tokenName: "QRL",
    isQrc20Token: false,
    tokenContractAddress: "",
    tokenDecimals: 18,
    transactionHash: "0xoriginal",
    blockNumber: "",
    gasUsed: "",
    effectiveGasPrice: "",
    status: false,
    timestamp: 0,
    chainId: "0x301825",
    pendingStatus: "pending",
    nonce: 3,
    maxFeePerGas: "200",
    maxPriorityFeePerGas: "100",
    gasLimit: 21000,
    ...fields,
  });

  it("speeds a native transfer up with the value as it was signed", async () => {
    const { store, qrl } = storeOnMockNode();
    const account = qrl.accounts.create();

    // The number in the history entry has lost the last digits.
    const result = await store.signAndSendReplacementTransaction(
      pendingTransfer(account.address, {
        amount: Number("0.123456789012345678"),
        value: "123456789012345678",
      }),
      "speed-up",
      account.seed,
    );

    expect(result.error).toBe("");
    expect(valueIn(result.rawTransaction)).toBe(123456789012345678n);
  });

  it("speeds up a small native transfer of an entry that has the amount only", async () => {
    const { store, qrl } = storeOnMockNode();
    const account = qrl.accounts.create();

    const result = await store.signAndSendReplacementTransaction(
      pendingTransfer(account.address, { amount: 0.0000001 }),
      "speed-up",
      account.seed,
    );

    expect(result.error).toBe("");
    expect(valueIn(result.rawTransaction)).toBe(100000000000n);
  });
});
