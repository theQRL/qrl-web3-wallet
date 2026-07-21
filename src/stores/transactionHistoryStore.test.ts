import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { TransactionHistoryEntry } from "@/types/transactionHistory";

const {
  mockGetTransactionHistory,
  mockSetTransactionHistoryEntry,
  mockClearTransactionHistory,
  mockUpdateTransactionHistoryEntry,
} = vi.hoisted(() => ({
  mockGetTransactionHistory: vi.fn<any>().mockResolvedValue([]),
  mockSetTransactionHistoryEntry: vi.fn<any>().mockResolvedValue(undefined),
  mockClearTransactionHistory: vi.fn<any>().mockResolvedValue(undefined),
  mockUpdateTransactionHistoryEntry: vi.fn<any>().mockResolvedValue(undefined),
}));

vi.mock("@/utilities/storageUtil", () => ({
  __esModule: true,
  default: {
    getTransactionHistory: (...args: any[]) =>
      mockGetTransactionHistory(...args),
    setTransactionHistoryEntry: (...args: any[]) =>
      mockSetTransactionHistoryEntry(...args),
    clearTransactionHistory: (...args: any[]) =>
      mockClearTransactionHistory(...args),
    updateTransactionHistoryEntry: (...args: any[]) =>
      mockUpdateTransactionHistoryEntry(...args),
  },
}));

const makeSampleEntry = (
  overrides: Partial<TransactionHistoryEntry> = {},
): TransactionHistoryEntry => ({
  id: "0xtxhash1",
  from: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
  to: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
  amount: 2.5,
  tokenSymbol: "QRL",
  tokenName: "QRL",
  isZrc20Token: false,
  tokenContractAddress: "",
  tokenDecimals: 18,
  transactionHash: "0xtxhash1",
  blockNumber: "100",
  gasUsed: "21000",
  effectiveGasPrice: "1000000000",
  status: true,
  timestamp: Date.now(),
  chainId: "0x1",
  ...overrides,
});

describe("TransactionHistoryStore", () => {
  // Dynamic import so mocks are in place
  let TransactionHistoryStore: typeof import("@/stores/transactionHistoryStore").default;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetTransactionHistory.mockResolvedValue([]);
    const module = await import("@/stores/transactionHistoryStore");
    TransactionHistoryStore = module.default;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should initialize with empty state", () => {
    const store = new TransactionHistoryStore();
    expect(store.transactions).toEqual([]);
    expect(store.isLoading).toBe(false);
    expect(store.filter).toBe("all");
    expect(store.filteredTransactions).toEqual([]);
    expect(store.pendingTransactions).toEqual([]);
  });

  it("should load history from storage", async () => {
    const entries = [makeSampleEntry(), makeSampleEntry({ id: "0xtxhash2", transactionHash: "0xtxhash2" })];
    mockGetTransactionHistory.mockResolvedValue(entries);

    const store = new TransactionHistoryStore();
    await store.loadHistory("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000");

    expect(mockGetTransactionHistory).toHaveBeenCalledWith(
      "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
    );
    expect(store.transactions).toEqual(entries);
    expect(store.isLoading).toBe(false);
  });

  it("should add transaction and reload", async () => {
    const entry = makeSampleEntry();
    mockGetTransactionHistory.mockResolvedValue([entry]);

    const store = new TransactionHistoryStore();
    await store.addTransaction(
      "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
      entry,
    );

    expect(mockSetTransactionHistoryEntry).toHaveBeenCalledWith(
      "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
      entry,
    );
    expect(mockGetTransactionHistory).toHaveBeenCalledWith(
      "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
    );
    expect(store.transactions).toEqual([entry]);
  });

  it("should set filter", () => {
    const store = new TransactionHistoryStore();
    store.setFilter("native");
    expect(store.filter).toBe("native");
    store.setFilter("zrc20");
    expect(store.filter).toBe("zrc20");
    store.setFilter("all");
    expect(store.filter).toBe("all");
  });

  it("should return filtered transactions for native filter", () => {
    const store = new TransactionHistoryStore();
    const nativeEntry = makeSampleEntry({ isZrc20Token: false });
    const zrc20Entry = makeSampleEntry({
      id: "0xtxhash2",
      transactionHash: "0xtxhash2",
      isZrc20Token: true,
      tokenSymbol: "TST",
    });

    // Manually set transactions since we're testing the computed property
    store.transactions = [nativeEntry, zrc20Entry];

    store.setFilter("native");
    expect(store.filteredTransactions).toEqual([nativeEntry]);

    store.setFilter("zrc20");
    expect(store.filteredTransactions).toEqual([zrc20Entry]);

    store.setFilter("all");
    expect(store.filteredTransactions).toEqual([nativeEntry, zrc20Entry]);
  });

  it("should clear history", async () => {
    const store = new TransactionHistoryStore();
    store.transactions = [makeSampleEntry()];

    await store.clearHistory("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000");

    expect(mockClearTransactionHistory).toHaveBeenCalledWith(
      "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
    );
    expect(store.transactions).toEqual([]);
  });

  it("should handle storage errors gracefully in loadHistory", async () => {
    mockGetTransactionHistory.mockRejectedValue(new Error("Storage error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const store = new TransactionHistoryStore();
    await store.loadHistory("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000");

    expect(store.transactions).toEqual([]);
    expect(store.isLoading).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  // ── pendingTransactions computed ──

  it("should return only pending transactions from pendingTransactions", () => {
    const store = new TransactionHistoryStore();
    const pending = makeSampleEntry({ pendingStatus: "pending", transactionHash: "0xpending" });
    const confirmed = makeSampleEntry({ pendingStatus: "confirmed", transactionHash: "0xconfirmed" });
    const failed = makeSampleEntry({ pendingStatus: "failed", transactionHash: "0xfailed" });

    store.transactions = [pending, confirmed, failed];

    expect(store.pendingTransactions).toEqual([pending]);
  });

  // ── updateTransaction ──

  it("should call updateTransactionHistoryEntry and reload", async () => {
    const entry = makeSampleEntry({ pendingStatus: "pending" });
    mockGetTransactionHistory.mockResolvedValue([
      { ...entry, pendingStatus: "confirmed", status: true },
    ]);

    const store = new TransactionHistoryStore();
    await store.updateTransaction(
      "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
      "0xtxhash1",
      { pendingStatus: "confirmed", status: true },
    );

    expect(mockUpdateTransactionHistoryEntry).toHaveBeenCalledWith(
      "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
      "0xtxhash1",
      { pendingStatus: "confirmed", status: true },
    );
    expect(mockGetTransactionHistory).toHaveBeenCalled();
  });

  // ── startPolling / stopPolling ──

  it("should start polling and update confirmed tx on receipt", async () => {
    const pendingEntry = makeSampleEntry({
      pendingStatus: "pending",
      transactionHash: "0xpending1",
    });

    const mockQrlInstance = {
      getTransactionReceipt: vi.fn<any>().mockResolvedValue({
        status: BigInt(1),
        blockNumber: BigInt(200),
        gasUsed: BigInt(21000),
        effectiveGasPrice: BigInt(2000000000),
      }),
    };

    const store = new TransactionHistoryStore();
    store.transactions = [pendingEntry];

    // After updateTransaction is called, return confirmed entry
    mockGetTransactionHistory.mockResolvedValue([
      { ...pendingEntry, pendingStatus: "confirmed", status: true },
    ]);

    store.startPolling("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000", mockQrlInstance);

    // Advance timer to trigger polling
    vi.advanceTimersByTime(10000);

    // Wait for async operations
    await vi.advanceTimersByTimeAsync(0);

    expect(mockQrlInstance.getTransactionReceipt).toHaveBeenCalledWith("0xpending1");
    expect(mockUpdateTransactionHistoryEntry).toHaveBeenCalledWith(
      "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
      "0xpending1",
      expect.objectContaining({
        pendingStatus: "confirmed",
        status: true,
      }),
    );

    store.stopPolling();
  });

  it("should mark failed tx when receipt status is not 1", async () => {
    const pendingEntry = makeSampleEntry({
      pendingStatus: "pending",
      transactionHash: "0xpending2",
    });

    const mockQrlInstance = {
      getTransactionReceipt: vi.fn<any>().mockResolvedValue({
        status: BigInt(0),
        blockNumber: BigInt(200),
        gasUsed: BigInt(21000),
        effectiveGasPrice: BigInt(1000000000),
      }),
    };

    const store = new TransactionHistoryStore();
    store.transactions = [pendingEntry];

    mockGetTransactionHistory.mockResolvedValue([
      { ...pendingEntry, pendingStatus: "failed", status: false },
    ]);

    store.startPolling("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000", mockQrlInstance);

    vi.advanceTimersByTime(10000);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockUpdateTransactionHistoryEntry).toHaveBeenCalledWith(
      "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
      "0xpending2",
      expect.objectContaining({
        pendingStatus: "failed",
        status: false,
      }),
    );

    store.stopPolling();
  });

  it("should skip tx when receipt is undefined (still pending)", async () => {
    const pendingEntry = makeSampleEntry({
      pendingStatus: "pending",
      transactionHash: "0xstillpending",
    });

    const mockQrlInstance = {
      getTransactionReceipt: vi.fn<any>().mockResolvedValue(undefined),
    };

    const store = new TransactionHistoryStore();
    store.transactions = [pendingEntry];

    store.startPolling("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000", mockQrlInstance);

    vi.advanceTimersByTime(10000);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockQrlInstance.getTransactionReceipt).toHaveBeenCalledWith("0xstillpending");
    expect(mockUpdateTransactionHistoryEntry).not.toHaveBeenCalled();

    store.stopPolling();
  });

  it("should stop polling when no more pending transactions", async () => {
    const confirmedEntry = makeSampleEntry({ pendingStatus: "confirmed" });

    const mockQrlInstance = {
      getTransactionReceipt: vi.fn<any>(),
    };

    const store = new TransactionHistoryStore();
    store.transactions = [confirmedEntry];

    store.startPolling("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000", mockQrlInstance);

    vi.advanceTimersByTime(10000);
    await vi.advanceTimersByTimeAsync(0);

    // Should not have called getTransactionReceipt since no pending txs
    expect(mockQrlInstance.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("should handle polling errors gracefully", async () => {
    const pendingEntry = makeSampleEntry({
      pendingStatus: "pending",
      transactionHash: "0xerror",
    });

    const mockQrlInstance = {
      getTransactionReceipt: vi.fn<any>().mockRejectedValue(new Error("Network error")),
    };

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const store = new TransactionHistoryStore();
    store.transactions = [pendingEntry];

    store.startPolling("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000", mockQrlInstance);

    vi.advanceTimersByTime(10000);
    await vi.advanceTimersByTimeAsync(0);

    expect(consoleSpy).toHaveBeenCalledWith(
      "Polling error for 0xerror:",
      expect.any(Error),
    );

    consoleSpy.mockRestore();
    store.stopPolling();
  });

  it("should stop previous polling when startPolling is called again", () => {
    const mockQrlInstance = {
      getTransactionReceipt: vi.fn<any>(),
    };

    const store = new TransactionHistoryStore();
    store.transactions = [makeSampleEntry({ pendingStatus: "pending" })];

    store.startPolling("account1", mockQrlInstance);
    store.startPolling("account2", mockQrlInstance);

    // stopPolling should clear the interval
    store.stopPolling();
  });

  it("stopPolling should be a no-op when not polling", () => {
    const store = new TransactionHistoryStore();
    // Should not throw
    store.stopPolling();
  });

  it("should auto-start polling when loadHistory finds pending txs", async () => {
    const pendingEntry = makeSampleEntry({ pendingStatus: "pending" });
    mockGetTransactionHistory.mockResolvedValue([pendingEntry]);

    const mockQrlInstance = {
      getTransactionReceipt: vi.fn<any>().mockResolvedValue(undefined),
    };

    const store = new TransactionHistoryStore();
    await store.loadHistory("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000", mockQrlInstance);

    // Advance timer to verify polling was started
    vi.advanceTimersByTime(10000);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockQrlInstance.getTransactionReceipt).toHaveBeenCalled();

    store.stopPolling();
  });

  it("should not start polling when loadHistory has no pending txs", async () => {
    const confirmedEntry = makeSampleEntry({ pendingStatus: "confirmed" });
    mockGetTransactionHistory.mockResolvedValue([confirmedEntry]);

    const mockQrlInstance = {
      getTransactionReceipt: vi.fn<any>(),
    };

    const store = new TransactionHistoryStore();
    await store.loadHistory("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000", mockQrlInstance);

    vi.advanceTimersByTime(10000);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockQrlInstance.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("should not start polling when no qrlInstance provided", async () => {
    const pendingEntry = makeSampleEntry({ pendingStatus: "pending" });
    mockGetTransactionHistory.mockResolvedValue([pendingEntry]);

    const store = new TransactionHistoryStore();
    await store.loadHistory("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000");

    // No qrlInstance, so no polling should start
    expect(store.pendingTransactions).toEqual([pendingEntry]);
  });
});
