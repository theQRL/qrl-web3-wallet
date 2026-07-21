import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionHistoryEntry } from "@/types/transactionHistory";

// In-memory mock of browser.storage.local and browser.storage.session
const localStore: Record<string, any> = {};
const sessionStore: Record<string, any> = {};

const makeStorageArea = (store: Record<string, any>) => ({
  get: vi.fn((key: string) =>
    Promise.resolve(key in store ? { [key]: store[key] } : {}),
  ),
  set: vi.fn((data: Record<string, any>) => {
    Object.assign(store, data);
    return Promise.resolve();
  }),
  remove: vi.fn((key: string) => {
    delete store[key];
    return Promise.resolve();
  }),
  clear: vi.fn(() => {
    for (const k of Object.keys(store)) delete store[k];
    return Promise.resolve();
  }),
});

const mockLocal = makeStorageArea(localStore);
const mockSession = makeStorageArea(sessionStore);

vi.mock("webextension-polyfill", () => ({
  __esModule: true,
  default: {
    storage: {
      local: mockLocal,
      session: mockSession,
    },
  },
}));

vi.mock("@/configuration/qrlBlockchainConfig", () => ({
  DEFAULT_BLOCKCHAIN: {
    chainId: "0x1",
    chainName: "Test Chain",
    rpcUrls: ["http://localhost:8545"],
    blockExplorerUrls: [""],
    nativeCurrency: { name: "Quanta", symbol: "QRL", decimals: 18 },
    iconUrls: [],
  },
  QRL_BLOCKCHAINS: [
    {
      chainId: "0x1",
      chainName: "Test Chain",
      rpcUrls: ["http://localhost:8545"],
      blockExplorerUrls: [""],
      nativeCurrency: { name: "Quanta", symbol: "QRL", decimals: 18 },
      iconUrls: [],
    },
  ],
}));

vi.mock("@theqrl/web3", () => ({
  KeyStore: class {},
}));

const clearStore = (store: Record<string, any>) => {
  for (const k of Object.keys(store)) delete store[k];
};

const ACCOUNT = "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000";
const ACCOUNT_2 = "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000";

const makeTxEntry = (
  overrides: Partial<TransactionHistoryEntry> = {},
): TransactionHistoryEntry => ({
  id: "0xtxhash1",
  from: ACCOUNT,
  to: ACCOUNT_2,
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
  timestamp: 1700000000000,
  chainId: "0x1",
  ...overrides,
});

describe("StorageUtil", () => {
  let StorageUtil: typeof import("@/utilities/storageUtil").default;
  let LockState: typeof import("@/utilities/storageUtil").LockState;

  beforeEach(async () => {
    vi.clearAllMocks();
    clearStore(localStore);
    clearStore(sessionStore);
    const module = await import("@/utilities/storageUtil");
    StorageUtil = module.default;
    LockState = module.LockState;
  });

  // ── Keystores ──────────────────────────────────────────────

  describe("Keystores", () => {
    it("should store and retrieve keystores", async () => {
      const keystores = [{ id: "ks1", address: "0x123" }] as any;
      await StorageUtil.setKeystores(keystores);
      const result = await StorageUtil.getKeystores();
      expect(result).toEqual(keystores);
    });

    it("should return empty array when no keystores stored", async () => {
      const result = await StorageUtil.getKeystores();
      expect(result).toEqual([]);
    });

    it("should clear keystores", async () => {
      await StorageUtil.setKeystores([{ id: "ks1" }] as any);
      await StorageUtil.clearKeystores();
      const result = await StorageUtil.getKeystores();
      expect(result).toEqual([]);
    });
  });

  // ── Lock state timestamp ───────────────────────────────────

  describe("updateLockStateTimeStamp", () => {
    it("should store a timestamp for LOCKED state", async () => {
      const before = Date.now();
      await StorageUtil.updateLockStateTimeStamp(LockState.LOCKED);
      expect(mockLocal.set).toHaveBeenCalled();
      const storedTs = localStore["LOCK_MANAGER_LOCKED_TIMESTAMP"];
      expect(storedTs).toBeGreaterThanOrEqual(before);
      expect(storedTs).toBeLessThanOrEqual(Date.now());
    });

    it("should store a timestamp for UNLOCKED state", async () => {
      await StorageUtil.updateLockStateTimeStamp(LockState.UNLOCKED);
      expect(localStore["LOCK_MANAGER_UNLOCKED_TIMESTAMP"]).toBeDefined();
    });
  });

  describe("getLockStateTimeStamp", () => {
    it("should return stored LOCKED timestamp", async () => {
      await StorageUtil.updateLockStateTimeStamp(LockState.LOCKED);
      const ts = await StorageUtil.getLockStateTimeStamp(LockState.LOCKED);
      expect(ts).toBeGreaterThan(0);
      expect(ts).toBe(localStore["LOCK_MANAGER_LOCKED_TIMESTAMP"]);
    });

    it("should return stored UNLOCKED timestamp", async () => {
      await StorageUtil.updateLockStateTimeStamp(LockState.UNLOCKED);
      const ts = await StorageUtil.getLockStateTimeStamp(LockState.UNLOCKED);
      expect(ts).toBeGreaterThan(0);
      expect(ts).toBe(localStore["LOCK_MANAGER_UNLOCKED_TIMESTAMP"]);
    });

    it("should return 0 when no timestamp exists", async () => {
      const ts = await StorageUtil.getLockStateTimeStamp(LockState.LOCKED);
      expect(ts).toBe(0);
    });

    it("should distinguish LOCKED and UNLOCKED timestamps", async () => {
      await StorageUtil.updateLockStateTimeStamp(LockState.UNLOCKED);
      const unlockedTs = localStore["LOCK_MANAGER_UNLOCKED_TIMESTAMP"];

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 5));

      await StorageUtil.updateLockStateTimeStamp(LockState.LOCKED);
      const lockedTs = localStore["LOCK_MANAGER_LOCKED_TIMESTAMP"];

      const readLocked = await StorageUtil.getLockStateTimeStamp(
        LockState.LOCKED,
      );
      const readUnlocked = await StorageUtil.getLockStateTimeStamp(
        LockState.UNLOCKED,
      );

      expect(readLocked).toBe(lockedTs);
      expect(readUnlocked).toBe(unlockedTs);
      expect(readLocked).toBeGreaterThanOrEqual(readUnlocked);
    });
  });

  // ── Accounts ───────────────────────────────────────────────

  describe("Accounts", () => {
    it("should store and retrieve all accounts", async () => {
      await StorageUtil.setAllAccounts([ACCOUNT, ACCOUNT_2]);
      const result = await StorageUtil.getAllAccounts();
      expect(result).toEqual([ACCOUNT, ACCOUNT_2]);
    });

    it("should return empty array when no accounts stored", async () => {
      const result = await StorageUtil.getAllAccounts();
      expect(result).toEqual([]);
    });

    it("should store and retrieve active account", async () => {
      await StorageUtil.setActiveAccount(ACCOUNT);
      const result = await StorageUtil.getActiveAccount();
      expect(result).toBe(ACCOUNT);
    });

    it("should return empty string when no active account", async () => {
      const result = await StorageUtil.getActiveAccount();
      expect(result).toBe("");
    });

    it("should clear active account when called with undefined", async () => {
      await StorageUtil.setActiveAccount(ACCOUNT);
      await StorageUtil.setActiveAccount(undefined);
      const result = await StorageUtil.getActiveAccount();
      expect(result).toBe("");
    });

    it("should clear active account", async () => {
      await StorageUtil.setActiveAccount(ACCOUNT);
      await StorageUtil.clearActiveAccount();
      const result = await StorageUtil.getActiveAccount();
      expect(result).toBe("");
    });

    it("should preserve all accounts when setting active account", async () => {
      await StorageUtil.setAllAccounts([ACCOUNT, ACCOUNT_2]);
      await StorageUtil.setActiveAccount(ACCOUNT);
      const allAccounts = await StorageUtil.getAllAccounts();
      expect(allAccounts).toEqual([ACCOUNT, ACCOUNT_2]);
    });
  });

  // ── Blockchains ────────────────────────────────────────────

  describe("Blockchains", () => {
    const chain1 = {
      chainId: "0x1",
      chainName: "Chain 1",
      rpcUrls: ["http://localhost:8545"],
      blockExplorerUrls: [""],
      nativeCurrency: { name: "Quanta", symbol: "QRL", decimals: 18 },
      iconUrls: [],
    };
    const chain2 = {
      chainId: "0x2",
      chainName: "Chain 2",
      rpcUrls: ["http://localhost:8546"],
      blockExplorerUrls: [""],
      nativeCurrency: { name: "Quanta", symbol: "QRL", decimals: 18 },
      iconUrls: [],
    };

    it("should store and retrieve all blockchains", async () => {
      await StorageUtil.setAllBlockChains([chain1, chain2] as any);
      const result = await StorageUtil.getAllBlockChains();
      expect(result).toEqual([chain1, chain2]);
    });

    it("should return default blockchains when none stored", async () => {
      const result = await StorageUtil.getAllBlockChains();
      // Returns QRL_BLOCKCHAINS from the mock
      expect(result).toHaveLength(1);
      expect(result[0].chainId).toBe("0x1");
    });

    it("should store and retrieve active blockchain", async () => {
      await StorageUtil.setAllBlockChains([chain1, chain2] as any);
      await StorageUtil.setActiveBlockChain("0x2");
      const result = await StorageUtil.getActiveBlockChain();
      expect(result.chainId).toBe("0x2");
    });

    it("should return default blockchain when active not found", async () => {
      await StorageUtil.setActiveBlockChain("0x999");
      const result = await StorageUtil.getActiveBlockChain();
      expect(result.chainId).toBe("0x1");
    });
  });

  // ── Active page ────────────────────────────────────────────

  describe("Active page", () => {
    it("should store and retrieve active page", async () => {
      await StorageUtil.setActivePage("/settings");
      const result = await StorageUtil.getActivePage();
      expect(result).toBe("/settings");
    });

    it("should return empty string when no active page", async () => {
      const result = await StorageUtil.getActivePage();
      expect(result).toBe("");
    });

    it("should remove active page when set with empty string", async () => {
      await StorageUtil.setActivePage("/settings");
      await StorageUtil.setActivePage("");
      const result = await StorageUtil.getActivePage();
      expect(result).toBe("");
    });

    it("should clear active page", async () => {
      await StorageUtil.setActivePage("/settings");
      await StorageUtil.clearActivePage();
      const result = await StorageUtil.getActivePage();
      expect(result).toBe("");
    });
  });

  // ── Transaction values ─────────────────────────────────────

  describe("Transaction values", () => {
    it("should store and retrieve transaction values", async () => {
      await StorageUtil.setTransactionValues({
        receiverAddress: ACCOUNT_2,
        amount: 10,
      });
      const result = await StorageUtil.getTransactionValues();
      expect(result.receiverAddress).toBe(ACCOUNT_2);
      expect(result.amount).toBe(10);
    });

    it("should return defaults when no transaction values stored", async () => {
      const result = await StorageUtil.getTransactionValues();
      expect(result.receiverAddress).toBe("");
      expect(result.amount).toBe(0);
    });

    it("should set default values for missing fields", async () => {
      await StorageUtil.setTransactionValues({});
      const result = await StorageUtil.getTransactionValues();
      expect(result.receiverAddress).toBe("");
      expect(result.amount).toBe(0);
    });

    it("should clear transaction values", async () => {
      await StorageUtil.setTransactionValues({
        receiverAddress: ACCOUNT_2,
        amount: 5,
      });
      await StorageUtil.clearTransactionValues();
      const result = await StorageUtil.getTransactionValues();
      expect(result.receiverAddress).toBe("");
      expect(result.amount).toBe(0);
    });

    it("should store token details", async () => {
      const tokenDetails = {
        isZrc20Token: true,
        tokenContractAddress: "0xtoken",
        tokenDecimals: 18,
        tokenImage: "img.png",
        tokenBalance: "100",
        tokenName: "TestToken",
        tokenSymbol: "TST",
      };
      await StorageUtil.setTransactionValues({ tokenDetails });
      const result = await StorageUtil.getTransactionValues();
      expect(result.tokenDetails).toEqual(tokenDetails);
    });
  });

  // ── Token contracts ────────────────────────────────────────

  describe("Token contracts", () => {
    const token1 = {
      address: "0xtoken1",
      symbol: "TK1",
      decimals: 18,
      image: "tk1.png",
    };
    const token2 = {
      address: "0xtoken2",
      symbol: "TK2",
      decimals: 8,
      image: "tk2.png",
    };

    it("should store and retrieve token contracts list", async () => {
      await StorageUtil.setTokenContractsList(ACCOUNT, token1);
      const result = await StorageUtil.getTokenContractsList(ACCOUNT);
      expect(result).toEqual([token1]);
    });

    it("should return empty array when no tokens stored", async () => {
      const result = await StorageUtil.getTokenContractsList(ACCOUNT);
      expect(result).toEqual([]);
    });

    it("should append new token to existing list", async () => {
      await StorageUtil.setTokenContractsList(ACCOUNT, token1);
      await StorageUtil.setTokenContractsList(ACCOUNT, token2);
      const result = await StorageUtil.getTokenContractsList(ACCOUNT);
      expect(result).toEqual([token1, token2]);
    });

    it("should deduplicate by address (update existing token)", async () => {
      await StorageUtil.setTokenContractsList(ACCOUNT, token1);
      const updatedToken1 = { ...token1, symbol: "TK1_V2" };
      await StorageUtil.setTokenContractsList(ACCOUNT, updatedToken1);
      const result = await StorageUtil.getTokenContractsList(ACCOUNT);
      expect(result).toEqual([updatedToken1]);
    });

    it("should clear a specific token from the list", async () => {
      await StorageUtil.setTokenContractsList(ACCOUNT, token1);
      await StorageUtil.setTokenContractsList(ACCOUNT, token2);
      await StorageUtil.clearFromTokenContractsList(ACCOUNT, "0xtoken1");
      const result = await StorageUtil.getTokenContractsList(ACCOUNT);
      expect(result).toEqual([token2]);
    });

    it("should keep tokens separate per account", async () => {
      await StorageUtil.setTokenContractsList(ACCOUNT, token1);
      await StorageUtil.setTokenContractsList(ACCOUNT_2, token2);
      expect(await StorageUtil.getTokenContractsList(ACCOUNT)).toEqual([
        token1,
      ]);
      expect(await StorageUtil.getTokenContractsList(ACCOUNT_2)).toEqual([
        token2,
      ]);
    });
  });

  // ── DApps request data (session storage) ───────────────────

  describe("DApps request data", () => {
    const requestData = { method: "qrl_requestAccounts" } as any;

    it("should store and retrieve DApp request data", async () => {
      await StorageUtil.setDAppsRequestData(requestData);
      const result = await StorageUtil.getDAppsRequestData();
      expect(result).toEqual(requestData);
    });

    it("should return undefined when no request data", async () => {
      const result = await StorageUtil.getDAppsRequestData();
      expect(result).toBeUndefined();
    });

    it("should clear DApp request data", async () => {
      await StorageUtil.setDAppsRequestData(requestData);
      await StorageUtil.clearDAppsRequestData();
      const result = await StorageUtil.getDAppsRequestData();
      expect(result).toBeUndefined();
    });
  });

  // ── DApps connected accounts ───────────────────────────────

  describe("DApps connected accounts", () => {
    const connectedData = {
      urlOrigin: "https://example.com",
      accounts: [ACCOUNT],
      blockchains: [],
      permissions: [],
    } as any;

    it("should store and retrieve connected accounts data", async () => {
      await StorageUtil.setDAppsConnectedAccountsData(connectedData);
      const result = await StorageUtil.getDAppsConnectedAccountsData(
        "https://example.com",
      );
      expect(result?.urlOrigin).toBe("https://example.com");
      expect(result?.accounts).toEqual([ACCOUNT]);
    });

    it("should return undefined for unknown origin", async () => {
      const result =
        await StorageUtil.getDAppsConnectedAccountsData("https://unknown.com");
      expect(result).toBeUndefined();
    });

    it("should clear connected accounts for a specific origin", async () => {
      await StorageUtil.setDAppsConnectedAccountsData(connectedData);
      await StorageUtil.clearDAppsConnectedAccountsData("https://example.com");
      const result = await StorageUtil.getDAppsConnectedAccountsData(
        "https://example.com",
      );
      expect(result).toBeUndefined();
    });

    it("should keep data for other origins when clearing one", async () => {
      const otherData = {
        ...connectedData,
        urlOrigin: "https://other.com",
        accounts: [ACCOUNT_2],
      };
      await StorageUtil.setDAppsConnectedAccountsData(connectedData);
      await StorageUtil.setDAppsConnectedAccountsData(otherData);
      await StorageUtil.clearDAppsConnectedAccountsData("https://example.com");

      const result =
        await StorageUtil.getDAppsConnectedAccountsData("https://other.com");
      expect(result?.accounts).toEqual([ACCOUNT_2]);
    });
  });

  // ── Ledger accounts ────────────────────────────────────────

  describe("Ledger accounts", () => {
    const ledgerAccount1 = {
      address: ACCOUNT,
      derivationPath: "m/44'/238'/0'/0/0",
      publicKey: "0xpub1",
      index: 0,
    };
    const ledgerAccount2 = {
      address: ACCOUNT_2,
      derivationPath: "m/44'/238'/0'/0/1",
      publicKey: "0xpub2",
      index: 1,
    };

    it("should store and retrieve ledger accounts", async () => {
      await StorageUtil.setLedgerAccounts([ledgerAccount1]);
      const result = await StorageUtil.getLedgerAccounts();
      expect(result).toEqual([ledgerAccount1]);
    });

    it("should return empty array when no ledger accounts", async () => {
      const result = await StorageUtil.getLedgerAccounts();
      expect(result).toEqual([]);
    });

    it("should clear ledger accounts", async () => {
      await StorageUtil.setLedgerAccounts([ledgerAccount1]);
      await StorageUtil.clearLedgerAccounts();
      const result = await StorageUtil.getLedgerAccounts();
      expect(result).toEqual([]);
    });

    it("should check if address is a ledger account", async () => {
      await StorageUtil.setLedgerAccounts([ledgerAccount1]);
      expect(await StorageUtil.isLedgerAccount(ACCOUNT)).toBe(true);
      expect(await StorageUtil.isLedgerAccount(ACCOUNT_2)).toBe(false);
    });

    it("should check ledger account case-insensitively", async () => {
      await StorageUtil.setLedgerAccounts([ledgerAccount1]);
      expect(
        await StorageUtil.isLedgerAccount(ACCOUNT.toLowerCase()),
      ).toBe(true);
    });

    it("should get ledger account by address", async () => {
      await StorageUtil.setLedgerAccounts([ledgerAccount1, ledgerAccount2]);
      const result = await StorageUtil.getLedgerAccountByAddress(ACCOUNT_2);
      expect(result).toEqual(ledgerAccount2);
    });

    it("should return undefined for unknown ledger address", async () => {
      await StorageUtil.setLedgerAccounts([ledgerAccount1]);
      const result = await StorageUtil.getLedgerAccountByAddress(
        "Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
      );
      expect(result).toBeUndefined();
    });

    it("should add ledger account to all accounts", async () => {
      await StorageUtil.addLedgerAccountToAllAccounts(ACCOUNT);
      const allAccounts = await StorageUtil.getAllAccounts();
      expect(allAccounts).toContain(ACCOUNT);
    });

    it("should not duplicate when adding ledger account to all accounts", async () => {
      await StorageUtil.addLedgerAccountToAllAccounts(ACCOUNT);
      await StorageUtil.addLedgerAccountToAllAccounts(ACCOUNT);
      const allAccounts = await StorageUtil.getAllAccounts();
      expect(allAccounts.filter((a) => a === ACCOUNT)).toHaveLength(1);
    });

    it("should handle case-insensitive duplicate check for ledger accounts", async () => {
      await StorageUtil.addLedgerAccountToAllAccounts(ACCOUNT);
      await StorageUtil.addLedgerAccountToAllAccounts(ACCOUNT.toLowerCase());
      const allAccounts = await StorageUtil.getAllAccounts();
      expect(allAccounts).toHaveLength(1);
    });

    it("should remove ledger account from all accounts", async () => {
      await StorageUtil.setAllAccounts([ACCOUNT, ACCOUNT_2]);
      await StorageUtil.removeLedgerAccountFromAllAccounts(ACCOUNT);
      const allAccounts = await StorageUtil.getAllAccounts();
      expect(allAccounts).toEqual([ACCOUNT_2]);
    });
  });

  // ── Transaction history ────────────────────────────────────

  describe("Transaction history", () => {
    describe("getTransactionHistory", () => {
      it("should return empty array when no history exists", async () => {
        const result = await StorageUtil.getTransactionHistory(ACCOUNT);
        expect(result).toEqual([]);
      });

      it("should return stored transactions for account and chain", async () => {
        const entries = [makeTxEntry()];
        localStore["TX_HISTORY"] = {
          ALL_TX_HISTORY: {
            [ACCOUNT]: { "0x1": { transactions: entries } },
          },
        };

        const result = await StorageUtil.getTransactionHistory(ACCOUNT);
        expect(result).toEqual(entries);
      });

      it("should return empty array for different account", async () => {
        localStore["TX_HISTORY"] = {
          ALL_TX_HISTORY: {
            [ACCOUNT]: { "0x1": { transactions: [makeTxEntry()] } },
          },
        };

        const result = await StorageUtil.getTransactionHistory(ACCOUNT_2);
        expect(result).toEqual([]);
      });
    });

    describe("setTransactionHistoryEntry", () => {
      it("should initialize nested structure when storage is empty", async () => {
        const entry = makeTxEntry();
        await StorageUtil.setTransactionHistoryEntry(ACCOUNT, entry);

        expect(
          localStore["TX_HISTORY"]["ALL_TX_HISTORY"][ACCOUNT]["0x1"]
            .transactions,
        ).toEqual([entry]);
      });

      it("should prepend new entry to existing transactions", async () => {
        const existing = makeTxEntry({
          id: "0xold",
          transactionHash: "0xold",
        });
        localStore["TX_HISTORY"] = {
          ALL_TX_HISTORY: {
            [ACCOUNT]: { "0x1": { transactions: [existing] } },
          },
        };

        const newEntry = makeTxEntry({
          id: "0xnew",
          transactionHash: "0xnew",
          amount: 5,
        });
        await StorageUtil.setTransactionHistoryEntry(ACCOUNT, newEntry);

        const stored =
          localStore["TX_HISTORY"]["ALL_TX_HISTORY"][ACCOUNT]["0x1"]
            .transactions;
        expect(stored).toHaveLength(2);
        expect(stored[0]).toEqual(newEntry);
        expect(stored[1]).toEqual(existing);
      });

      it("should deduplicate by transactionHash", async () => {
        const existing = makeTxEntry({ amount: 2.5 });
        localStore["TX_HISTORY"] = {
          ALL_TX_HISTORY: {
            [ACCOUNT]: { "0x1": { transactions: [existing] } },
          },
        };

        const updated = makeTxEntry({ status: false });
        await StorageUtil.setTransactionHistoryEntry(ACCOUNT, updated);

        const stored =
          localStore["TX_HISTORY"]["ALL_TX_HISTORY"][ACCOUNT]["0x1"]
            .transactions;
        expect(stored).toHaveLength(1);
        expect(stored[0]).toEqual(updated);
      });

      it("should not affect other accounts in storage", async () => {
        const otherEntry = makeTxEntry({
          id: "0xother",
          transactionHash: "0xother",
        });
        localStore["TX_HISTORY"] = {
          ALL_TX_HISTORY: {
            [ACCOUNT_2]: { "0x1": { transactions: [otherEntry] } },
          },
        };

        await StorageUtil.setTransactionHistoryEntry(ACCOUNT, makeTxEntry());

        expect(
          localStore["TX_HISTORY"]["ALL_TX_HISTORY"][ACCOUNT_2]["0x1"]
            .transactions,
        ).toEqual([otherEntry]);
      });
    });

    describe("clearTransactionHistory", () => {
      it("should clear transactions for the account", async () => {
        localStore["TX_HISTORY"] = {
          ALL_TX_HISTORY: {
            [ACCOUNT]: { "0x1": { transactions: [makeTxEntry()] } },
          },
        };

        await StorageUtil.clearTransactionHistory(ACCOUNT);

        expect(
          localStore["TX_HISTORY"]["ALL_TX_HISTORY"][ACCOUNT]["0x1"]
            .transactions,
        ).toEqual([]);
      });

      it("should do nothing when no history exists", async () => {
        await StorageUtil.clearTransactionHistory(ACCOUNT);
        expect(localStore["TX_HISTORY"]).toBeUndefined();
      });

      it("should not affect other accounts when clearing", async () => {
        const otherEntry = makeTxEntry({
          id: "0xother",
          transactionHash: "0xother",
        });
        localStore["TX_HISTORY"] = {
          ALL_TX_HISTORY: {
            [ACCOUNT]: { "0x1": { transactions: [makeTxEntry()] } },
            [ACCOUNT_2]: { "0x1": { transactions: [otherEntry] } },
          },
        };

        await StorageUtil.clearTransactionHistory(ACCOUNT);

        expect(
          localStore["TX_HISTORY"]["ALL_TX_HISTORY"][ACCOUNT]["0x1"]
            .transactions,
        ).toEqual([]);
        expect(
          localStore["TX_HISTORY"]["ALL_TX_HISTORY"][ACCOUNT_2]["0x1"]
            .transactions,
        ).toEqual([otherEntry]);
      });
    });
  });

  describe("Contacts", () => {
    it("should clear contacts", async () => {
      await StorageUtil.setContacts([
        { name: "Alice", address: ACCOUNT },
      ]);
      await StorageUtil.clearContacts();
      const result = await StorageUtil.getContacts();
      expect(result).toEqual([]);
    });
  });

  describe("Account labels", () => {
    it("should set a single account label", async () => {
      await StorageUtil.setAccountLabel(ACCOUNT, "My Main Account");
      const labels = await StorageUtil.getAccountLabels();
      expect(labels[ACCOUNT]).toBe("My Main Account");
    });

    it("should preserve existing labels when setting a single label", async () => {
      await StorageUtil.setAccountLabels({
        [ACCOUNT]: "Account 1",
      });
      await StorageUtil.setAccountLabel(ACCOUNT_2, "Account 2");
      const labels = await StorageUtil.getAccountLabels();
      expect(labels[ACCOUNT]).toBe("Account 1");
      expect(labels[ACCOUNT_2]).toBe("Account 2");
    });

    it("should clear all account labels", async () => {
      await StorageUtil.setAccountLabels({
        [ACCOUNT]: "Account 1",
        [ACCOUNT_2]: "Account 2",
      });
      await StorageUtil.clearAccountLabels();
      const labels = await StorageUtil.getAccountLabels();
      expect(labels).toEqual({});
    });
  });

  describe("clearAllData", () => {
    it("should clear all data from local storage", async () => {
      await StorageUtil.setAllAccounts([ACCOUNT]);
      await StorageUtil.setActivePage("/settings");
      await StorageUtil.clearAllData();
      expect(mockLocal.clear).toHaveBeenCalled();
    });
  });

  // ── Price cache ──────────────────────────────────────────

  describe("Price cache", () => {
    it("should store and retrieve price cache", async () => {
      const cache = {
        prices: { usd: 1.5, eur: 1.3 },
        change24h: { usd: 2.5, eur: 2.1 },
        timestamp: Date.now(),
      };
      await StorageUtil.setPriceCache(cache);
      const result = await StorageUtil.getPriceCache();
      expect(result).toEqual(cache);
    });

    it("should return null when no price cache exists", async () => {
      const result = await StorageUtil.getPriceCache();
      expect(result).toBeNull();
    });

    it("should overwrite existing price cache", async () => {
      const cache1 = {
        prices: { usd: 1.0 },
        change24h: { usd: 1.0 },
        timestamp: 1000,
      };
      const cache2 = {
        prices: { usd: 2.0, eur: 1.8 },
        change24h: { usd: 3.0, eur: 2.5 },
        timestamp: 2000,
      };
      await StorageUtil.setPriceCache(cache1);
      await StorageUtil.setPriceCache(cache2);
      const result = await StorageUtil.getPriceCache();
      expect(result).toEqual(cache2);
    });
  });

  // ── Settings (showBalanceAndPrice) ──────────────────────

  describe("Settings", () => {
    it("should store and retrieve settings with showBalanceAndPrice", async () => {
      await StorageUtil.setSettings({
        showBalanceAndPrice: false,
        currency: "EUR",
      });
      const result = await StorageUtil.getSettings();
      expect(result.showBalanceAndPrice).toBe(false);
      expect(result.currency).toBe("EUR");
    });

    it("should return empty object when no settings stored", async () => {
      const result = await StorageUtil.getSettings();
      expect(result).toEqual({});
    });

    it("should preserve showBalanceAndPrice default as undefined", async () => {
      await StorageUtil.setSettings({ currency: "USD" });
      const result = await StorageUtil.getSettings();
      expect(result.showBalanceAndPrice).toBeUndefined();
    });
  });

  // ── updateTransactionHistoryEntry ──

  describe("updateTransactionHistoryEntry", () => {
    it("should update a specific transaction by hash", async () => {
      const entry1 = makeTxEntry({ transactionHash: "0xhash1", id: "0xhash1", pendingStatus: "pending" });
      const entry2 = makeTxEntry({ transactionHash: "0xhash2", id: "0xhash2", pendingStatus: "pending" });

      await StorageUtil.setTransactionHistoryEntry(ACCOUNT, entry1);
      await StorageUtil.setTransactionHistoryEntry(ACCOUNT, entry2);

      await StorageUtil.updateTransactionHistoryEntry(
        ACCOUNT,
        "0xhash1",
        { pendingStatus: "confirmed", status: true },
      );

      const history = await StorageUtil.getTransactionHistory(ACCOUNT);
      const updated = history.find((tx) => tx.transactionHash === "0xhash1");
      const unchanged = history.find((tx) => tx.transactionHash === "0xhash2");

      expect(updated?.pendingStatus).toBe("confirmed");
      expect(updated?.status).toBe(true);
      expect(unchanged?.pendingStatus).toBe("pending");
    });

    it("should not modify other transactions when updating one", async () => {
      const entry = makeTxEntry({ transactionHash: "0xonly", id: "0xonly", amount: 5 });
      await StorageUtil.setTransactionHistoryEntry(ACCOUNT, entry);

      await StorageUtil.updateTransactionHistoryEntry(
        ACCOUNT,
        "0xonly",
        { pendingStatus: "failed" },
      );

      const history = await StorageUtil.getTransactionHistory(ACCOUNT);
      expect(history).toHaveLength(1);
      expect(history[0].amount).toBe(5);
      expect(history[0].pendingStatus).toBe("failed");
    });
  });

  // ── getPendingTransactions ──

  describe("getPendingTransactions", () => {
    it("should return only pending transactions", async () => {
      const pending = makeTxEntry({
        transactionHash: "0xpending",
        id: "0xpending",
        pendingStatus: "pending",
      });
      const confirmed = makeTxEntry({
        transactionHash: "0xconfirmed",
        id: "0xconfirmed",
        pendingStatus: "confirmed",
      });

      await StorageUtil.setTransactionHistoryEntry(ACCOUNT, pending);
      await StorageUtil.setTransactionHistoryEntry(ACCOUNT, confirmed);

      const result = await StorageUtil.getPendingTransactions(ACCOUNT);
      expect(result).toHaveLength(1);
      expect(result[0].transactionHash).toBe("0xpending");
    });

    it("should return empty array when no pending transactions", async () => {
      const confirmed = makeTxEntry({
        transactionHash: "0xdone",
        id: "0xdone",
        pendingStatus: "confirmed",
      });

      await StorageUtil.setTransactionHistoryEntry(ACCOUNT, confirmed);

      const result = await StorageUtil.getPendingTransactions(ACCOUNT);
      expect(result).toEqual([]);
    });

    it("should return empty array for account with no history", async () => {
      const result = await StorageUtil.getPendingTransactions(ACCOUNT);
      expect(result).toEqual([]);
    });
  });
});
