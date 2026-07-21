import { LOCK_MANAGER_MESSAGES } from "@/scripts/lockManager/lockManager";
import type {
  TokenFilter,
  TransactionHistoryEntry,
} from "@/types/transactionHistory";
import StorageUtil from "@/utilities/storageUtil";
import { isSuccessfulReceiptStatus } from "@/utilities/receiptStatusUtil";
import browser from "webextension-polyfill";
import {
  action,
  computed,
  makeAutoObservable,
  observable,
  runInAction,
} from "mobx";

type ReceiptStatus = boolean | string | number | bigint;

type QrlInstance = {
  getTransactionReceipt: (
    txHash: string,
  ) => Promise<
    | {
        status?: ReceiptStatus;
        blockNumber?: bigint;
        gasUsed?: bigint;
        effectiveGasPrice?: bigint;
      }
    | undefined
  >;
};

class TransactionHistoryStore {
  transactions: TransactionHistoryEntry[] = [];
  isLoading = false;
  filter: TokenFilter = "all";
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    makeAutoObservable(this, {
      transactions: observable,
      isLoading: observable,
      filter: observable,
      filteredTransactions: computed,
      pendingTransactions: computed,
      loadHistory: action.bound,
      addTransaction: action.bound,
      updateTransaction: action.bound,
      setFilter: action.bound,
      clearHistory: action.bound,
      startPolling: action.bound,
      stopPolling: action.bound,
    });
  }

  get filteredTransactions(): TransactionHistoryEntry[] {
    if (this.filter === "all") return this.transactions;
    if (this.filter === "native")
      return this.transactions.filter(
        (tx) => !tx.isZrc20Token && !tx.tokenContractAddress,
      );
    if (this.filter === "nft")
      return this.transactions.filter(
        (tx) => !tx.isZrc20Token && !!tx.tokenContractAddress,
      );
    return this.transactions.filter((tx) => tx.isZrc20Token);
  }

  get pendingTransactions(): TransactionHistoryEntry[] {
    return this.transactions.filter((tx) => tx.pendingStatus === "pending");
  }

  async loadHistory(accountAddress: string, qrlInstance?: QrlInstance) {
    this.isLoading = true;
    try {
      const history =
        await StorageUtil.getTransactionHistory(accountAddress);
      runInAction(() => {
        this.transactions = history;
      });
      if (
        qrlInstance &&
        history.some((tx) => tx.pendingStatus === "pending")
      ) {
        this.startPolling(accountAddress, qrlInstance);
      }
    } catch (error) {
      console.error("Failed to load transaction history:", error);
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  async addTransaction(
    accountAddress: string,
    entry: TransactionHistoryEntry,
  ) {
    await StorageUtil.setTransactionHistoryEntry(accountAddress, entry);
    await this.loadHistory(accountAddress);
    if (entry.pendingStatus === "confirmed" || entry.pendingStatus === "failed") {
      browser.runtime
        .sendMessage({
          name: LOCK_MANAGER_MESSAGES.SEND_TX_NOTIFICATION,
          data: {
            status: entry.pendingStatus,
            amount: entry.amount,
            tokenSymbol: entry.tokenSymbol,
            txHash: entry.transactionHash,
          },
        })
        .catch(() => {});
    }
  }

  async updateTransaction(
    accountAddress: string,
    transactionHash: string,
    updates: Partial<TransactionHistoryEntry>,
  ) {
    await StorageUtil.updateTransactionHistoryEntry(
      accountAddress,
      transactionHash,
      updates,
    );
    await this.loadHistory(accountAddress);
  }

  setFilter(filter: TokenFilter) {
    this.filter = filter;
  }

  async clearHistory(accountAddress: string) {
    await StorageUtil.clearTransactionHistory(accountAddress);
    runInAction(() => {
      this.transactions = [];
    });
  }

  startPolling(accountAddress: string, qrlInstance: QrlInstance) {
    this.stopPolling();

    this.pollingInterval = setInterval(async () => {
      const pending = this.pendingTransactions;
      if (pending.length === 0) {
        this.stopPolling();
        return;
      }

      for (const tx of pending) {
        try {
          const receipt = await qrlInstance.getTransactionReceipt(
            tx.transactionHash,
          );
          if (receipt) {
            const isSuccess = isSuccessfulReceiptStatus(receipt.status);
            const newStatus = isSuccess ? "confirmed" : "failed";
            await this.updateTransaction(
              accountAddress,
              tx.transactionHash,
              {
                pendingStatus: newStatus,
                status: isSuccess,
                blockNumber: receipt.blockNumber?.toString() ?? "",
                gasUsed: receipt.gasUsed?.toString() ?? "",
                effectiveGasPrice: (
                  receipt.effectiveGasPrice ?? 0
                ).toString(),
              },
            );
            browser.runtime
              .sendMessage({
                name: LOCK_MANAGER_MESSAGES.SEND_TX_NOTIFICATION,
                data: {
                  status: newStatus,
                  amount: tx.amount,
                  tokenSymbol: tx.tokenSymbol,
                  txHash: tx.transactionHash,
                },
              })
              .catch(() => {});
          }
        } catch (error) {
          console.error(
            `Polling error for ${tx.transactionHash}:`,
            error,
          );
        }
      }
    }, 10000);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}

export default TransactionHistoryStore;
