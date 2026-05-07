import {
  BlockchainDataType,
  DEFAULT_BLOCKCHAIN,
  QRL_BLOCKCHAINS,
} from "@/configuration/qrlBlockchainConfig";
import {
  ConnectedAccountsDataType,
  DAppRequestType,
  TokenContractType,
} from "@/scripts/middlewares/middlewareTypes";
import type { LedgerAccount } from "@/services/ledger/ledgerTypes";
import type { Contact } from "@/types/contact";
import type { GasTier } from "@/types/gasFee";
import type { NFTCollectionType } from "@/types/nft";
import type { TransactionHistoryEntry } from "@/types/transactionHistory";
import { KeyStore } from "@theqrl/web3";
import browser from "webextension-polyfill";

const KEYSTORES_IDENTIFIER = "KEYSTORES";

const ACCOUNTS_IDENTIFIER = "ACCOUNTS";
const ALL_ACCOUNTS_IDENTIFIER = "ALL_ACCOUNTS";
const ACTIVE_ACCOUNT_IDENTIFIER = "ACTIVE_ACCOUNT";

const LEDGER_IDENTIFIER = "LEDGER";
const LEDGER_ACCOUNTS_IDENTIFIER = "LEDGER_ACCOUNTS";

const BLOCKCHAINS_IDENTIFIER = "BLOCKCHAINS";
const ALL_BLOCKCHAINS_IDENTIFIER = "ALL_BLOCKCHAINS";
const ACTIVE_BLOCKCHAIN_IDENTIFIER = "ACTIVE_BLOCKCHAIN";

const DAPPS_IDENTIFIER = "DAPPS";
const ALL_DAPPS_IDENTIFIER = "ALL_DAPPS";
const DAPPS_REQUEST_DATA_IDENTIFIER = "DAPPS_REQUEST_DATA";

const TOKENS_IDENTIFIER = "TOKENS";
const ALL_TOKENS_IDENTIFIER = "ALL_TOKENS";

const ACTIVE_PAGE_IDENTIFIER = "ACTIVE_PAGE";

const TRANSACTION_VALUES_IDENTIFIER = "TRANSACTION_VALUES";

const TX_HISTORY_IDENTIFIER = "TX_HISTORY";
const ALL_TX_HISTORY_IDENTIFIER = "ALL_TX_HISTORY";

const CONTACTS_IDENTIFIER = "CONTACTS";
const ALL_CONTACTS_IDENTIFIER = "ALL_CONTACTS";

const ACCOUNT_LABELS_IDENTIFIER = "ACCOUNT_LABELS";
const HIDDEN_ACCOUNTS_IDENTIFIER = "HIDDEN_ACCOUNTS";

const NFT_COLLECTIONS_IDENTIFIER = "NFT_COLLECTIONS";
const ALL_NFT_COLLECTIONS_IDENTIFIER = "ALL_NFT_COLLECTIONS";

const SETTINGS_IDENTIFIER = "SETTINGS";
const PRICE_CACHE_IDENTIFIER = "PRICE_CACHE";

export type WalletSettings = {
  themePreference?: "system" | "light" | "dark";
  autoLockMinutes?: number;
  currency?: string;
  language?: string;
  defaultGasTier?: GasTier;
  showBalanceAndPrice?: boolean;
  sidePanelPreferred?: boolean;
  notificationsEnabled?: boolean;
  phishingDetectionEnabled?: boolean;
};

export type PriceCache = {
  prices: Record<string, number>;
  change24h: Record<string, number>;
  timestamp: number;
};

type TransactionValuesType = {
  receiverAddress?: string;
  amount?: number;
  tokenDetails?: {
    isZrc20Token: boolean;
    tokenContractAddress: string;
    tokenDecimals: number;
    tokenImage: string;
    tokenBalance: string;
    tokenName: string;
    tokenSymbol: string;
  };
};

export const LockState = Object.freeze({
  LOCKED: "LOCKED",
  UNLOCKED: "UNLOCKED",
});

export type LockStateType = (typeof LockState)[keyof typeof LockState];

/**
 * A utility for storing and retrieving states of different components to and from the browser storage.
 */
class StorageUtil {
  // Cap retained tx-history entries per account+chain so unbounded
  // growth under `unlimitedStorage` cannot wedge the popup ↔ SW port
  // (Chromium's 64 MB silent-drop limit).
  static readonly TX_HISTORY_MAX_PER_ACCOUNT_CHAIN = 1000;
  /**
   * A function for storing the keystore data.
   * Call the getKeystore function to retrieve the stored value, and clearKeystore for clearing the stored value.
   */
  static async setKeystores(keystores: KeyStore[]) {
    await browser.storage.local.set({
      [KEYSTORES_IDENTIFIER]: JSON.stringify(keystores),
    });
  }

  static async getKeystores() {
    const storageData = await browser.storage.local.get(KEYSTORES_IDENTIFIER);
    const keyStores = storageData?.[KEYSTORES_IDENTIFIER];
    return (keyStores ? JSON.parse(keyStores) : []) as KeyStore[];
  }

  static async clearKeystores() {
    await browser.storage.local.remove(KEYSTORES_IDENTIFIER);
  }

  static async updateLockStateTimeStamp(lockState: LockStateType) {
    const lockStatusIdentifier = `LOCK_MANAGER_${lockState}_TIMESTAMP`;
    await browser.storage.local.set({
      [lockStatusIdentifier]: Date.now(),
    });
  }

  static async getLockStateTimeStamp(lockState: LockStateType): Promise<number> {
    const key = `LOCK_MANAGER_${lockState}_TIMESTAMP`;
    const data = await browser.storage.local.get(key);
    return (data?.[key] ?? 0) as number;
  }

  /**
   * A function for storing the transaction state values, so that the user need not fill in the field values if the extension is closed and opened again.
   * Call the getTransactionValues fuction to retieve the stored value.
   */
  static async setTransactionValues(transactionValues: TransactionValuesType) {
    const { chainId } = await this.getActiveBlockChain();
    const transactionValuesIdentifier = `${chainId}_${TRANSACTION_VALUES_IDENTIFIER}`;
    const transactionValuesWithDefaultValues = {
      receiverAddress: transactionValues.receiverAddress ?? "",
      amount: transactionValues.amount ?? 0,
      tokenDetails: transactionValues.tokenDetails,
    };
    await browser.storage.local.set({
      [transactionValuesIdentifier]: transactionValuesWithDefaultValues,
    });
  }

  static async getTransactionValues() {
    const { chainId } = await this.getActiveBlockChain();
    const transactionValuesIdentifier = `${chainId}_${TRANSACTION_VALUES_IDENTIFIER}`;
    let transactionValues: TransactionValuesType = {
      receiverAddress: "",
      amount: 0,
    };

    const storedTransactionValues = await browser.storage.local.get(
      transactionValuesIdentifier,
    );
    if (storedTransactionValues) {
      transactionValues = {
        ...transactionValues,
        ...storedTransactionValues[transactionValuesIdentifier],
      };
    }

    return transactionValues;
  }

  static async clearTransactionValues() {
    const { chainId } = await this.getActiveBlockChain();
    const transactionValuesIdentifier = `${chainId}_${TRANSACTION_VALUES_IDENTIFIER}`;
    await browser.storage.local.remove(transactionValuesIdentifier);
  }

  /**
   * A function for storing the accounts created and imported within the qrl web3 wallet extension.
   * Call the getAllAccounts function to retrieve the stored value.
   */
  static async setAllAccounts(accountList: string[]) {
    const existing = (await browser.storage.local.get(ACCOUNTS_IDENTIFIER))?.[
      ACCOUNTS_IDENTIFIER
    ];
    await browser.storage.local.set({
      [ACCOUNTS_IDENTIFIER]: {
        ...existing,
        [ALL_ACCOUNTS_IDENTIFIER]: accountList,
      },
    });
  }

  static async getAllAccounts() {
    const storedAllAccounts = (
      await browser.storage.local.get(ACCOUNTS_IDENTIFIER)
    )?.[ACCOUNTS_IDENTIFIER];
    return (storedAllAccounts?.[ALL_ACCOUNTS_IDENTIFIER] ?? []) as string[];
  }

  /**
   * A function for storing the active account in the wallet.
   * Call the getActiveAccount function to retrieve the stored value, and clearActiveAccount for clearing the stored value.
   */
  static async setActiveAccount(activeAccount?: string) {
    if (activeAccount) {
      const existing = (await browser.storage.local.get(ACCOUNTS_IDENTIFIER))?.[
        ACCOUNTS_IDENTIFIER
      ];
      await browser.storage.local.set({
        [ACCOUNTS_IDENTIFIER]: {
          ...existing,
          [ACTIVE_ACCOUNT_IDENTIFIER]: activeAccount ?? "",
        },
      });
    } else {
      await this.clearActiveAccount();
    }
  }

  static async getActiveAccount() {
    const storedAccounts = (
      await browser.storage.local.get(ACCOUNTS_IDENTIFIER)
    )?.[ACCOUNTS_IDENTIFIER];
    return (storedAccounts?.[ACTIVE_ACCOUNT_IDENTIFIER] ?? "") as string;
  }

  static async clearActiveAccount() {
    const storedAccounts =
      (await browser.storage.local.get(ACCOUNTS_IDENTIFIER))?.[
        ACCOUNTS_IDENTIFIER
      ] ?? {};
    delete storedAccounts?.[ACTIVE_ACCOUNT_IDENTIFIER];
    await browser.storage.local.set({
      [ACCOUNTS_IDENTIFIER]: storedAccounts,
    });
  }

  /**
   * A function for storing all the available blockchains.
   * Call the getAllBlockChains function to retrieve all the stored blockchains.
   */
  static async setAllBlockChains(blockchains: BlockchainDataType[]) {
    const existing = (
      await browser.storage.local.get(BLOCKCHAINS_IDENTIFIER)
    )?.[BLOCKCHAINS_IDENTIFIER];
    await browser.storage.local.set({
      [BLOCKCHAINS_IDENTIFIER]: {
        ...existing,
        [ALL_BLOCKCHAINS_IDENTIFIER]: blockchains,
      },
    });
  }

  static async getAllBlockChains() {
    const storedBlockchains = (
      await browser.storage.local.get(BLOCKCHAINS_IDENTIFIER)
    )?.[BLOCKCHAINS_IDENTIFIER];
    return (storedBlockchains?.[ALL_BLOCKCHAINS_IDENTIFIER] ??
      QRL_BLOCKCHAINS) as BlockchainDataType[];
  }

  /**
   * A function for storing the blockchain selection.
   * Call the getActiveBlockChain function to retrieve the stored value.
   */
  static async setActiveBlockChain(selectedBlockchainId: string) {
    const existing = (
      await browser.storage.local.get(BLOCKCHAINS_IDENTIFIER)
    )?.[BLOCKCHAINS_IDENTIFIER];
    await browser.storage.local.set({
      [BLOCKCHAINS_IDENTIFIER]: {
        ...existing,
        [ACTIVE_BLOCKCHAIN_IDENTIFIER]: selectedBlockchainId,
      },
    });
  }

  static async getActiveBlockChain() {
    const storedBlockchains = (
      await browser.storage.local.get(BLOCKCHAINS_IDENTIFIER)
    )?.[BLOCKCHAINS_IDENTIFIER];
    const blockchains = await this.getAllBlockChains();
    const existingChain = blockchains.find(
      (chain) =>
        chain.chainId.toLowerCase() ===
        storedBlockchains?.[ACTIVE_BLOCKCHAIN_IDENTIFIER]?.toLowerCase(),
    );
    return existingChain ?? DEFAULT_BLOCKCHAIN;
  }

  /**
   * A function for storing the route to be displayed on opening the extension.
   * Call the getActivePage function to retrieve the stored value, and clearActivePage for clearing the stored value.
   */
  static async setActivePage(activePage: string) {
    if (activePage) {
      await browser.storage.local.set({ [ACTIVE_PAGE_IDENTIFIER]: activePage });
    } else {
      await browser.storage.local.remove(ACTIVE_PAGE_IDENTIFIER);
    }
  }

  static async getActivePage() {
    const storedActivePage = await browser.storage.local.get(
      ACTIVE_PAGE_IDENTIFIER,
    );
    return (storedActivePage?.[ACTIVE_PAGE_IDENTIFIER] ?? "") as string;
  }

  static async clearActivePage() {
    await browser.storage.local.remove(ACTIVE_PAGE_IDENTIFIER);
  }

  /**
   * A function for storing the list of imported tokens.
   * Call the getTokenContractsList function to retrieve the stored value, and clearFromTokenList for clearing the stored value.
   */
  static async setTokenContractsList(
    accountAddress: string,
    tokenContract: TokenContractType,
  ) {
    const { chainId } = await this.getActiveBlockChain();

    const storageData = await browser.storage.local.get(TOKENS_IDENTIFIER);
    if (!storageData[TOKENS_IDENTIFIER]) {
      storageData[TOKENS_IDENTIFIER] = {};
    }
    if (!storageData[TOKENS_IDENTIFIER][ALL_TOKENS_IDENTIFIER]) {
      storageData[TOKENS_IDENTIFIER][ALL_TOKENS_IDENTIFIER] = {};
    }
    if (
      !storageData[TOKENS_IDENTIFIER][ALL_TOKENS_IDENTIFIER][accountAddress]
    ) {
      storageData[TOKENS_IDENTIFIER][ALL_TOKENS_IDENTIFIER][accountAddress] =
        {};
    }
    if (
      !storageData[TOKENS_IDENTIFIER][ALL_TOKENS_IDENTIFIER][accountAddress][
        chainId
      ]
    ) {
      storageData[TOKENS_IDENTIFIER][ALL_TOKENS_IDENTIFIER][accountAddress][
        chainId
      ] = {};
    }
    const storedTokenContracts =
      await this.getTokenContractsList(accountAddress);
    storageData[TOKENS_IDENTIFIER][ALL_TOKENS_IDENTIFIER][accountAddress][
      chainId
    ].tokens = [
      ...(storedTokenContracts?.filter(
        (token) => token.address !== tokenContract.address,
      ) ?? []),
      tokenContract,
    ];

    await browser.storage.local.set(storageData);
  }

  static async getTokenContractsList(accountAddress: string) {
    const { chainId } = await this.getActiveBlockChain();

    const storageData = await browser.storage.local.get(TOKENS_IDENTIFIER);
    const storedTokenContracts =
      storageData?.[TOKENS_IDENTIFIER]?.[ALL_TOKENS_IDENTIFIER]?.[
        accountAddress
      ]?.[chainId]?.tokens ?? [];

    return storedTokenContracts as TokenContractType[];
  }

  static async clearFromTokenContractsList(
    accountAddress: string,
    contractAddress: string,
  ) {
    const { chainId } = await this.getActiveBlockChain();

    const storageData = await browser.storage.local.get(TOKENS_IDENTIFIER);
    const storedTokenContracts =
      await this.getTokenContractsList(accountAddress);
    storageData[TOKENS_IDENTIFIER][ALL_TOKENS_IDENTIFIER][accountAddress][
      chainId
    ].tokens = storedTokenContracts.filter(
      (token) => token.address !== contractAddress,
    );

    await browser.storage.local.set({ ...storageData });
  }

  static async setNFTCollectionsList(
    accountAddress: string,
    collection: NFTCollectionType,
  ) {
    const { chainId } = await this.getActiveBlockChain();

    const storageData = await browser.storage.local.get(
      NFT_COLLECTIONS_IDENTIFIER,
    );
    if (!storageData[NFT_COLLECTIONS_IDENTIFIER]) {
      storageData[NFT_COLLECTIONS_IDENTIFIER] = {};
    }
    if (
      !storageData[NFT_COLLECTIONS_IDENTIFIER][ALL_NFT_COLLECTIONS_IDENTIFIER]
    ) {
      storageData[NFT_COLLECTIONS_IDENTIFIER][
        ALL_NFT_COLLECTIONS_IDENTIFIER
      ] = {};
    }
    if (
      !storageData[NFT_COLLECTIONS_IDENTIFIER][
        ALL_NFT_COLLECTIONS_IDENTIFIER
      ][accountAddress]
    ) {
      storageData[NFT_COLLECTIONS_IDENTIFIER][
        ALL_NFT_COLLECTIONS_IDENTIFIER
      ][accountAddress] = {};
    }
    if (
      !storageData[NFT_COLLECTIONS_IDENTIFIER][
        ALL_NFT_COLLECTIONS_IDENTIFIER
      ][accountAddress][chainId]
    ) {
      storageData[NFT_COLLECTIONS_IDENTIFIER][
        ALL_NFT_COLLECTIONS_IDENTIFIER
      ][accountAddress][chainId] = {};
    }
    const storedCollections =
      await this.getNFTCollectionsList(accountAddress);
    storageData[NFT_COLLECTIONS_IDENTIFIER][ALL_NFT_COLLECTIONS_IDENTIFIER][
      accountAddress
    ][chainId].collections = [
      ...storedCollections.filter((c) => c.address !== collection.address),
      collection,
    ];

    await browser.storage.local.set(storageData);
  }

  static async getNFTCollectionsList(accountAddress: string) {
    const { chainId } = await this.getActiveBlockChain();

    const storageData = await browser.storage.local.get(
      NFT_COLLECTIONS_IDENTIFIER,
    );
    const storedCollections =
      storageData?.[NFT_COLLECTIONS_IDENTIFIER]?.[
        ALL_NFT_COLLECTIONS_IDENTIFIER
      ]?.[accountAddress]?.[chainId]?.collections ?? [];

    return storedCollections as NFTCollectionType[];
  }

  static async clearFromNFTCollectionsList(
    accountAddress: string,
    contractAddress: string,
  ) {
    const { chainId } = await this.getActiveBlockChain();

    const storageData = await browser.storage.local.get(
      NFT_COLLECTIONS_IDENTIFIER,
    );
    const storedCollections =
      await this.getNFTCollectionsList(accountAddress);
    storageData[NFT_COLLECTIONS_IDENTIFIER][ALL_NFT_COLLECTIONS_IDENTIFIER][
      accountAddress
    ][chainId].collections = storedCollections.filter(
      (c) => c.address !== contractAddress,
    );

    await browser.storage.local.set({ ...storageData });
  }

  /**
   * A function for storing the request info temporarily by the dApp, which will be read by the qrl web3 wallet.
   * Call the getDAppsRequestData function to retrieve the stored value, and clearDAppsRequestData for clearing the stored value.
   */
  static async setDAppsRequestData(dAppsRequestData: DAppRequestType) {
    await browser.storage.session.set({
      [DAPPS_IDENTIFIER]: {
        [DAPPS_REQUEST_DATA_IDENTIFIER]: dAppsRequestData,
      },
    });
  }

  static async getDAppsRequestData() {
    const storedDAppsRequestData = (
      await browser.storage.session.get(DAPPS_IDENTIFIER)
    )?.[DAPPS_IDENTIFIER];
    return storedDAppsRequestData?.[DAPPS_REQUEST_DATA_IDENTIFIER] as
      | DAppRequestType
      | undefined;
  }

  static async clearDAppsRequestData() {
    const storedDAppsRequestData =
      (await browser.storage.session.get(DAPPS_IDENTIFIER))?.[
        DAPPS_IDENTIFIER
      ] ?? {};
    delete storedDAppsRequestData?.[DAPPS_REQUEST_DATA_IDENTIFIER];
    await browser.storage.session.set({
      [DAPPS_IDENTIFIER]: storedDAppsRequestData,
    });
  }

  /**
   * A function for storing the connected accounts info temporarily, which will be read by method like 'qrl_accounts'.
   * Call the getDAppsConnectedAccountsData function to retrieve the stored value, and clearDAppsConnectedAccountsData for clearing the stored value.
   */
  static async setDAppsConnectedAccountsData(data: ConnectedAccountsDataType) {
    const urlOrigin = data.urlOrigin;

    const storageData = await browser.storage.local.get(DAPPS_IDENTIFIER);
    if (!storageData[DAPPS_IDENTIFIER]) {
      storageData[DAPPS_IDENTIFIER] = {};
    }
    if (!storageData[DAPPS_IDENTIFIER][ALL_DAPPS_IDENTIFIER]) {
      storageData[DAPPS_IDENTIFIER][ALL_DAPPS_IDENTIFIER] = {};
    }
    if (!storageData[DAPPS_IDENTIFIER][ALL_DAPPS_IDENTIFIER][urlOrigin]) {
      storageData[DAPPS_IDENTIFIER][ALL_DAPPS_IDENTIFIER][urlOrigin] = {};
    }
    storageData[DAPPS_IDENTIFIER][ALL_DAPPS_IDENTIFIER][urlOrigin].urlOrigin =
      urlOrigin;
    storageData[DAPPS_IDENTIFIER][ALL_DAPPS_IDENTIFIER][urlOrigin].accounts =
      data.accounts;
    storageData[DAPPS_IDENTIFIER][ALL_DAPPS_IDENTIFIER][urlOrigin].blockchains =
      data.blockchains;
    storageData[DAPPS_IDENTIFIER][ALL_DAPPS_IDENTIFIER][urlOrigin].permissions =
      data.permissions;

    await browser.storage.local.set(storageData);
  }

  static async getDAppsConnectedAccountsData(urlOrigin: string = "") {
    const storageData = await browser.storage.local.get(DAPPS_IDENTIFIER);
    return storageData?.[DAPPS_IDENTIFIER]?.[ALL_DAPPS_IDENTIFIER]?.[
      urlOrigin
    ] as ConnectedAccountsDataType | undefined;
  }

  static async clearDAppsConnectedAccountsData(urlOrigin: string = "") {
    const storageData = await browser.storage.local.get(DAPPS_IDENTIFIER);
    delete storageData[DAPPS_IDENTIFIER]?.[ALL_DAPPS_IDENTIFIER]?.[urlOrigin];
    await browser.storage.local.set(storageData);
  }

  static async setContacts(contacts: Contact[]) {
    await browser.storage.local.set({
      [CONTACTS_IDENTIFIER]: {
        [ALL_CONTACTS_IDENTIFIER]: contacts,
      },
    });
  }

  static async getContacts(): Promise<Contact[]> {
    const storageData = await browser.storage.local.get(CONTACTS_IDENTIFIER);
    const contacts =
      storageData?.[CONTACTS_IDENTIFIER]?.[ALL_CONTACTS_IDENTIFIER] ?? [];
    return contacts as Contact[];
  }

  static async clearContacts() {
    await browser.storage.local.remove(CONTACTS_IDENTIFIER);
  }

  /**
   * Account labels — a map from account address to a user-defined label.
   */
  static async setAccountLabels(labels: Record<string, string>) {
    await browser.storage.local.set({
      [ACCOUNT_LABELS_IDENTIFIER]: labels,
    });
  }

  static async getAccountLabels(): Promise<Record<string, string>> {
    const storageData = await browser.storage.local.get(
      ACCOUNT_LABELS_IDENTIFIER,
    );
    return (storageData?.[ACCOUNT_LABELS_IDENTIFIER] ?? {}) as Record<
      string,
      string
    >;
  }

  static async setAccountLabel(address: string, label: string) {
    const labels = await this.getAccountLabels();
    labels[address] = label;
    await this.setAccountLabels(labels);
  }

  static async clearAccountLabels() {
    await browser.storage.local.remove(ACCOUNT_LABELS_IDENTIFIER);
  }

  static async setHiddenAccounts(hidden: Record<string, boolean>) {
    await browser.storage.local.set({
      [HIDDEN_ACCOUNTS_IDENTIFIER]: hidden,
    });
  }

  static async getHiddenAccounts(): Promise<Record<string, boolean>> {
    const storageData = await browser.storage.local.get(
      HIDDEN_ACCOUNTS_IDENTIFIER,
    );
    return (storageData?.[HIDDEN_ACCOUNTS_IDENTIFIER] ?? {}) as Record<
      string,
      boolean
    >;
  }

  static async clearHiddenAccounts() {
    await browser.storage.local.remove(HIDDEN_ACCOUNTS_IDENTIFIER);
  }

  static async setSettings(settings: WalletSettings) {
    await browser.storage.local.set({
      [SETTINGS_IDENTIFIER]: settings,
    });
  }

  static async getSettings(): Promise<WalletSettings> {
    const storageData = await browser.storage.local.get(SETTINGS_IDENTIFIER);
    return (storageData?.[SETTINGS_IDENTIFIER] ?? {}) as WalletSettings;
  }

  static async clearAllData() {
    await browser.storage.local.clear();
  }

  /**
   * Stores Ledger accounts.
   *
   * WHY SEPARATE STORAGE:
   * Ledger accounts are stored separately from regular accounts because:
   * 1. They don't have private keys stored locally
   * 2. They need additional metadata (derivation path, device info)
   * 3. Signing requires different flow (device interaction)
   *
   * STRUCTURE:
   * {
   *   LEDGER: {
   *     LEDGER_ACCOUNTS: [
   *       { address, derivationPath, publicKey, index },
   *       ...
   *     ]
   *   }
   * }
   */
  static async setLedgerAccounts(accounts: LedgerAccount[]) {
    const existing =
      (await browser.storage.local.get(LEDGER_IDENTIFIER))?.[LEDGER_IDENTIFIER] ?? {};

    await browser.storage.local.set({
      [LEDGER_IDENTIFIER]: {
        ...existing,
        [LEDGER_ACCOUNTS_IDENTIFIER]: accounts,
      },
    });
  }

  /**
   * Retrieves all stored Ledger accounts.
   *
   * @returns Array of Ledger accounts (empty array if none)
   */
  static async getLedgerAccounts(): Promise<LedgerAccount[]> {
    const storedLedger = (await browser.storage.local.get(LEDGER_IDENTIFIER))?.[
      LEDGER_IDENTIFIER
    ];
    return (storedLedger?.[LEDGER_ACCOUNTS_IDENTIFIER] ?? []) as LedgerAccount[];
  }

  /**
   * Clears all stored Ledger accounts.
   * Use with caution - removes all Ledger account data.
   */
  static async clearLedgerAccounts() {
    const storedLedger =
      (await browser.storage.local.get(LEDGER_IDENTIFIER))?.[LEDGER_IDENTIFIER] ?? {};
    delete storedLedger?.[LEDGER_ACCOUNTS_IDENTIFIER];
    await browser.storage.local.set({
      [LEDGER_IDENTIFIER]: storedLedger,
    });
  }

  /**
   * Adds a Ledger account address to the global accounts list.
   *
   * @param address - Ledger account address to add
   */
  static async addLedgerAccountToAllAccounts(address: string) {
    const allAccounts = await this.getAllAccounts();

    // Avoid duplicates
    if (
      !allAccounts.some((a) => a.toLowerCase() === address.toLowerCase())
    ) {
      await this.setAllAccounts([...allAccounts, address]);
    }
  }

  /**
   * Removes a Ledger account address from the global accounts list.
   *
   * @param address - Ledger account address to remove
   */
  static async removeLedgerAccountFromAllAccounts(address: string) {
    const allAccounts = await this.getAllAccounts();
    const filteredAccounts = allAccounts.filter(
      (a) => a.toLowerCase() !== address.toLowerCase()
    );
    await this.setAllAccounts(filteredAccounts);
  }

  /**
   * Checks if an address belongs to a Ledger account.
   *
   * @param address - Address to check
   * @returns true if address is a Ledger account
   */
  static async isLedgerAccount(address: string): Promise<boolean> {
    const ledgerAccounts = await this.getLedgerAccounts();
    return ledgerAccounts.some(
      (a) => a.address.toLowerCase() === address.toLowerCase()
    );
  }

  /**
   * Gets a Ledger account by address.
   *
   * @param address - Address to look up
   * @returns Ledger account or undefined if not found
   */
  static async getLedgerAccountByAddress(
    address: string
  ): Promise<LedgerAccount | undefined> {
    const ledgerAccounts = await this.getLedgerAccounts();
    return ledgerAccounts.find(
      (a) => a.address.toLowerCase() === address.toLowerCase()
    );
  }

  static async setTransactionHistoryEntry(
    accountAddress: string,
    entry: TransactionHistoryEntry,
  ) {
    const { chainId } = await this.getActiveBlockChain();

    const storageData = await browser.storage.local.get(TX_HISTORY_IDENTIFIER);
    if (!storageData[TX_HISTORY_IDENTIFIER]) {
      storageData[TX_HISTORY_IDENTIFIER] = {};
    }
    if (!storageData[TX_HISTORY_IDENTIFIER][ALL_TX_HISTORY_IDENTIFIER]) {
      storageData[TX_HISTORY_IDENTIFIER][ALL_TX_HISTORY_IDENTIFIER] = {};
    }
    if (
      !storageData[TX_HISTORY_IDENTIFIER][ALL_TX_HISTORY_IDENTIFIER][
        accountAddress
      ]
    ) {
      storageData[TX_HISTORY_IDENTIFIER][ALL_TX_HISTORY_IDENTIFIER][
        accountAddress
      ] = {};
    }
    if (
      !storageData[TX_HISTORY_IDENTIFIER][ALL_TX_HISTORY_IDENTIFIER][
        accountAddress
      ][chainId]
    ) {
      storageData[TX_HISTORY_IDENTIFIER][ALL_TX_HISTORY_IDENTIFIER][
        accountAddress
      ][chainId] = {};
    }

    const existing = await this.getTransactionHistory(accountAddress);
    const merged = [
      entry,
      ...existing.filter((tx) => tx.transactionHash !== entry.transactionHash),
    ];
    storageData[TX_HISTORY_IDENTIFIER][ALL_TX_HISTORY_IDENTIFIER][
      accountAddress
    ][chainId].transactions = merged.slice(0, StorageUtil.TX_HISTORY_MAX_PER_ACCOUNT_CHAIN);

    await browser.storage.local.set(storageData);
  }

  static async getTransactionHistory(
    accountAddress: string,
  ): Promise<TransactionHistoryEntry[]> {
    const { chainId } = await this.getActiveBlockChain();

    const storageData = await browser.storage.local.get(TX_HISTORY_IDENTIFIER);
    const transactions =
      storageData?.[TX_HISTORY_IDENTIFIER]?.[ALL_TX_HISTORY_IDENTIFIER]?.[
        accountAddress
      ]?.[chainId]?.transactions ?? [];

    return transactions as TransactionHistoryEntry[];
  }

  static async updateTransactionHistoryEntry(
    accountAddress: string,
    transactionHash: string,
    updates: Partial<TransactionHistoryEntry>,
  ) {
    const { chainId } = await this.getActiveBlockChain();

    const storageData = await browser.storage.local.get(TX_HISTORY_IDENTIFIER);
    const transactions: TransactionHistoryEntry[] =
      storageData?.[TX_HISTORY_IDENTIFIER]?.[ALL_TX_HISTORY_IDENTIFIER]?.[
        accountAddress
      ]?.[chainId]?.transactions ?? [];

    // confirmed / failed are terminal states; refuse updates that would
    // revert a tx back to pending (or otherwise change a terminal status).
    const TERMINAL: Array<TransactionHistoryEntry["pendingStatus"]> = [
      "confirmed",
      "failed",
    ];
    const updatedTransactions = transactions.map((tx) => {
      if (tx.transactionHash !== transactionHash) return tx;
      const merged = { ...tx, ...updates };
      if (TERMINAL.includes(tx.pendingStatus)) {
        merged.pendingStatus = tx.pendingStatus;
        merged.status = tx.status;
      }
      return merged;
    });

    storageData[TX_HISTORY_IDENTIFIER][ALL_TX_HISTORY_IDENTIFIER][
      accountAddress
    ][chainId].transactions = updatedTransactions;

    await browser.storage.local.set(storageData);
  }

  static async getPendingTransactions(
    accountAddress: string,
  ): Promise<TransactionHistoryEntry[]> {
    const history = await this.getTransactionHistory(accountAddress);
    return history.filter((tx) => tx.pendingStatus === "pending");
  }

  static async clearTransactionHistory(accountAddress: string) {
    const { chainId } = await this.getActiveBlockChain();

    const storageData = await browser.storage.local.get(TX_HISTORY_IDENTIFIER);
    if (
      storageData?.[TX_HISTORY_IDENTIFIER]?.[ALL_TX_HISTORY_IDENTIFIER]?.[
        accountAddress
      ]?.[chainId]
    ) {
      storageData[TX_HISTORY_IDENTIFIER][ALL_TX_HISTORY_IDENTIFIER][
        accountAddress
      ][chainId].transactions = [];
      await browser.storage.local.set(storageData);
    }
  }

  static async setPriceCache(cache: PriceCache) {
    await browser.storage.local.set({
      [PRICE_CACHE_IDENTIFIER]: cache,
    });
  }

  static async getPriceCache(): Promise<PriceCache | null> {
    const storageData = await browser.storage.local.get(PRICE_CACHE_IDENTIFIER);
    return (storageData?.[PRICE_CACHE_IDENTIFIER] ?? null) as PriceCache | null;
  }
}

export default StorageUtil;
