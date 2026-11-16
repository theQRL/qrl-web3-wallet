import { beforeEach, describe, expect, it, vi } from "vitest";

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

const clearStore = (store: Record<string, any>) => {
  for (const k of Object.keys(store)) delete store[k];
};

const ACCOUNT = "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000";
const ACCOUNT_2 = "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000";

// A history entry exactly as a version before the QRC-20 rename stored it.
const earlierEntry = (hash: string, isToken: boolean) => ({
  id: hash,
  from: ACCOUNT,
  to: ACCOUNT_2,
  amount: 2.5,
  tokenSymbol: isToken ? "RUN" : "QRL",
  tokenName: isToken ? "Run Token" : "QRL",
  isZrc20Token: isToken,
  tokenContractAddress: isToken ? ACCOUNT_2 : "",
  tokenDecimals: 18,
  transactionHash: hash,
  blockNumber: "100",
  gasUsed: "21000",
  effectiveGasPrice: "1000000000",
  status: true,
  timestamp: 1700000000000,
  chainId: "0x1",
});

const storedHistory = () =>
  localStore["TX_HISTORY"]["ALL_TX_HISTORY"][ACCOUNT]["0x1"].transactions;

describe("data stored under the earlier ZRC names", () => {
  let StorageUtil: typeof import("@/utilities/storageUtil").default;

  beforeEach(async () => {
    vi.clearAllMocks();
    clearStore(localStore);
    clearStore(sessionStore);
    StorageUtil = (await import("@/utilities/storageUtil")).default;
  });

  describe("transaction history", () => {
    beforeEach(() => {
      localStore["TX_HISTORY"] = {
        ALL_TX_HISTORY: {
          [ACCOUNT]: {
            "0x1": {
              transactions: [
                earlierEntry("0xtoken", true),
                earlierEntry("0xnative", false),
              ],
            },
          },
        },
      };
    });

    it("is read under the current name with its value kept", async () => {
      const history = await StorageUtil.getTransactionHistory(ACCOUNT);
      expect(history.map((tx) => [tx.transactionHash, tx.isQrc20Token])).toEqual(
        [
          ["0xtoken", true],
          ["0xnative", false],
        ],
      );
      expect(history.every((tx) => !("isZrc20Token" in tx))).toBe(true);
    });

    it("is stored under the current name once a new entry is added", async () => {
      const [first] = await StorageUtil.getTransactionHistory(ACCOUNT);
      await StorageUtil.setTransactionHistoryEntry(ACCOUNT, {
        ...first,
        id: "0xnew",
        transactionHash: "0xnew",
      });
      expect(
        storedHistory().map((tx: Record<string, unknown>) => [
          tx.transactionHash,
          tx.isQrc20Token,
          "isZrc20Token" in tx,
        ]),
      ).toEqual([
        ["0xnew", true, false],
        ["0xtoken", true, false],
        ["0xnative", false, false],
      ]);
    });

    it("keeps the flag when an entry is updated", async () => {
      await StorageUtil.updateTransactionHistoryEntry(ACCOUNT, "0xtoken", {
        blockNumber: "101",
      });
      const token = storedHistory().find(
        (tx: Record<string, unknown>) => tx.transactionHash === "0xtoken",
      );
      expect(token.blockNumber).toBe("101");
      expect(token.isQrc20Token).toBe(true);
      expect("isZrc20Token" in token).toBe(false);
    });

    it("returns a pending token transfer as a token transfer", async () => {
      // Speed Up and Cancel build the replacement from this flag: read as
      // false, a pending token transfer would be replaced by a native one.
      storedHistory()[0] = {
        ...earlierEntry("0xtoken", true),
        pendingStatus: "pending",
        nonce: 7,
      };
      const [pending] = await StorageUtil.getPendingTransactions(ACCOUNT);
      expect(pending.transactionHash).toBe("0xtoken");
      expect(pending.isQrc20Token).toBe(true);
      expect(pending.tokenContractAddress).toBe(ACCOUNT_2);
    });

    it("lets the current name win when an entry carries both", async () => {
      storedHistory()[0] = { ...earlierEntry("0xtoken", false), isQrc20Token: true };
      const [entry] = await StorageUtil.getTransactionHistory(ACCOUNT);
      expect(entry.isQrc20Token).toBe(true);
      expect("isZrc20Token" in entry).toBe(false);
    });
  });

  it("reads a transfer draft's token flag under the current name", async () => {
    localStore["0x1_TRANSACTION_VALUES"] = {
      receiverAddress: ACCOUNT_2,
      amount: 3,
      tokenDetails: {
        isZrc20Token: true,
        tokenContractAddress: ACCOUNT_2,
        tokenDecimals: 18,
      },
    };
    const draft = await StorageUtil.getTransactionValues();
    expect(draft).toEqual({
      receiverAddress: ACCOUNT_2,
      amount: 3,
      tokenDetails: {
        isQrc20Token: true,
        tokenContractAddress: ACCOUNT_2,
        tokenDecimals: 18,
      },
    });
  });

  it("reads a draft without token details and no draft at all unchanged", async () => {
    expect(await StorageUtil.getTransactionValues()).toEqual({
      receiverAddress: "",
      amount: 0,
    });
    localStore["0x1_TRANSACTION_VALUES"] = { receiverAddress: ACCOUNT_2, amount: 1 };
    expect(await StorageUtil.getTransactionValues()).toEqual({
      receiverAddress: ACCOUNT_2,
      amount: 1,
    });
  });

  it("reads and rewrites NFT collections with the current standard names", async () => {
    localStore["NFT_COLLECTIONS"] = {
      ALL_NFT_COLLECTIONS: {
        [ACCOUNT]: {
          "0x1": {
            collections: [
              { address: "Qa", name: "A", symbol: "A", standard: "ZRC721" },
              { address: "Qb", name: "B", symbol: "B", standard: "ZRC1155" },
              { address: "Qc", name: "C", symbol: "C", standard: "QRC721" },
            ],
          },
        },
      },
    };
    const collections = await StorageUtil.getNFTCollectionsList(ACCOUNT);
    expect(collections.map((c) => c.standard)).toEqual([
      "QRC721",
      "QRC1155",
      "QRC721",
    ]);

    await StorageUtil.setNFTCollectionsList(ACCOUNT, {
      ...collections[0],
      address: "Qd",
    });
    expect(
      localStore["NFT_COLLECTIONS"]["ALL_NFT_COLLECTIONS"][ACCOUNT][
        "0x1"
      ].collections.map((c: Record<string, unknown>) => c.standard),
    ).toEqual(["QRC721", "QRC1155", "QRC721", "QRC721"]);
  });
});
