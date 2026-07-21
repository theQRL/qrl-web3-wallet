/**
 * Ledger Store - MobX state management for Ledger Hardware Wallet.
 *
 * This store centralizes all Ledger-related state in one place, providing:
 * 1. Reactive UI updates - MobX observables automatically trigger re-renders
 * 2. Single source of truth - all components read from the same state
 * 3. Separation of concerns - UI components don't need to know about Ledger internals
 * 4. Persistence integration - syncs with browser storage for Ledger accounts
 *
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  UI Components (React)                                          │
 * │      ↓ observe                                                  │
 * │  ledgerStore (this file - MobX observable state)                │
 * │      ↓ calls                                                    │
 * │  ledgerService (business logic)                                 │
 * │      ↓ calls                                                    │
 * │  ledgerTransport (WebHID communication)                         │
 * │      ↓ USB                                                      │
 * │  Ledger Device                                                  │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * STATE FLOW:
 * - User clicks "Connect Ledger" → action triggers → state updates → UI re-renders
 * - Device disconnects → callback triggers → state updates → UI shows disconnected
 * - Signing starts → state.signingStatus changes → UI shows "Check your device"
 */

import { action, computed, makeAutoObservable, observable, runInAction } from "mobx";
import { ledgerService } from "@/services/ledger/ledgerService";
import { ledgerTransport } from "@/services/ledger/ledgerTransport";
import type { LedgerAccount, LedgerDeviceInfo } from "@/services/ledger/ledgerTypes";
import StorageUtil from "@/utilities/storageUtil";
import { LEDGER_ERROR_MESSAGES } from "@/constants/ledger";
import { getDerivationPath } from "@/services/ledger/ledgerApdu";
import { FeeMarketEIP1559Transaction } from "@theqrl/web3-qrl-accounts";
import { newMLDSA87Descriptor } from "@theqrl/wallet.js";

/**
 * Possible states for Ledger connection.
 */
export type LedgerConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/**
 * Possible states for Ledger signing operations.
 */
export type LedgerSigningState =
  | "idle"
  | "awaiting_confirmation"
  | "signing"
  | "completed"
  | "error";

/**
 * Signing status for UI display.
 */
export interface SigningStatusInfo {
  state: LedgerSigningState;
  message: string;
}

/**
 * Result of a signing operation (store-specific type).
 */
export interface StoreSignResult {
  success: boolean;
  signature?: string;
  rawTransaction?: string;
  error?: string;
}

/**
 * LedgerStore - Central state management for Ledger integration.
 */
class LedgerStore {
  connectionState: LedgerConnectionState = "disconnected";
  deviceInfo: LedgerDeviceInfo | null = null;
  connectionError: string = "";

  accounts: LedgerAccount[] = [];
  isLoadingAccounts: boolean = false;
  private nextAccountIndex: number = 0;

  signingState: LedgerSigningState = "idle";
  signingStatus: SigningStatusInfo | null = null;
  signResult: StoreSignResult | null = null;

  constructor() {
    makeAutoObservable(this, {
      connectionState: observable,
      deviceInfo: observable.struct,
      connectionError: observable,
      accounts: observable.struct,
      isLoadingAccounts: observable,
      signingState: observable,
      signingStatus: observable.struct,
      signResult: observable.struct,
      isConnected: computed,
      isConnecting: computed,
      hasError: computed,
      hasAccounts: computed,
      isSigning: computed,
      isAwaitingConfirmation: computed,
      connect: action.bound,
      disconnect: action.bound,
      loadAccounts: action.bound,
      fetchPageAccounts: action.bound,
      addAccount: action.bound,
      removeAccount: action.bound,
      verifyAddress: action.bound,
      signTransaction: action.bound,
      signAndSerializeTransaction: action.bound,
      clearSigningState: action.bound,
      clearError: action.bound,
    });

    ledgerTransport.onDisconnect(() => {
      this.handleDeviceDisconnect();
    });

    this.loadAccountsFromStorage();
  }

  get isConnected(): boolean {
    return this.connectionState === "connected";
  }

  get isConnecting(): boolean {
    return this.connectionState === "connecting";
  }

  get hasError(): boolean {
    return this.connectionState === "error" && this.connectionError !== "";
  }

  get hasAccounts(): boolean {
    return this.accounts.length > 0;
  }

  get isSigning(): boolean {
    return (
      this.signingState === "signing" ||
      this.signingState === "awaiting_confirmation"
    );
  }

  get isAwaitingConfirmation(): boolean {
    return this.signingState === "awaiting_confirmation";
  }

  async connect(): Promise<void> {
    if (this.connectionState === "connecting") {
      return;
    }

    runInAction(() => {
      this.connectionState = "connecting";
      this.connectionError = "";
    });

    try {
      // ledgerService.connect() handles both transport connection and device info fetching
      const deviceInfo = await ledgerService.connect();

      runInAction(() => {
        this.connectionState = "connected";
        this.deviceInfo = deviceInfo;
        this.connectionError = "";
      });

      console.log("[LedgerStore] Connected successfully:", deviceInfo);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : LEDGER_ERROR_MESSAGES.CONNECTION_FAILED;

      runInAction(() => {
        this.connectionState = "error";
        this.connectionError = errorMessage;
        this.deviceInfo = null;
      });

      console.error("[LedgerStore] Connection failed:", errorMessage);
    }
  }

  async disconnect(): Promise<void> {
    try {
      await ledgerTransport.disconnect();
    } catch (error) {
      console.error("[LedgerStore] Error during disconnect:", error);
    } finally {
      runInAction(() => {
        this.connectionState = "disconnected";
        this.deviceInfo = null;
        this.connectionError = "";
      });

      console.log("[LedgerStore] Disconnected");
    }
  }

  private handleDeviceDisconnect(): void {
    runInAction(() => {
      this.connectionState = "disconnected";
      this.deviceInfo = null;

      if (this.isSigning) {
        this.signingState = "error";
        this.signResult = {
          success: false,
          error: LEDGER_ERROR_MESSAGES.DEVICE_DISCONNECTED,
        };
      }
    });

    console.log("[LedgerStore] Device disconnected unexpectedly");
  }

  clearError(): void {
    this.connectionError = "";
    if (this.connectionState === "error") {
      this.connectionState = "disconnected";
    }
  }

  private async loadAccountsFromStorage(): Promise<void> {
    try {
      const storedAccounts = await StorageUtil.getLedgerAccounts();
      runInAction(() => {
        this.accounts = storedAccounts;
        if (storedAccounts.length > 0) {
          const maxIndex = Math.max(...storedAccounts.map((a) => a.index));
          this.nextAccountIndex = maxIndex + 1;
        }
      });
      console.log(
        "[LedgerStore] Loaded accounts from storage:",
        storedAccounts.length
      );
    } catch (error) {
      console.error("[LedgerStore] Failed to load accounts from storage:", error);
    }
  }

  async loadAccounts(count: number = 5, startIndex: number = 0): Promise<void> {
    if (!this.isConnected) {
      throw new Error(LEDGER_ERROR_MESSAGES.NOT_CONNECTED);
    }

    runInAction(() => {
      this.isLoadingAccounts = true;
    });

    try {
      const accounts = await ledgerService.getAccounts(startIndex, count);

      runInAction(() => {
        this.accounts = accounts;
        this.nextAccountIndex = startIndex + count;
      });

      await StorageUtil.setLedgerAccounts(accounts);

      console.log("[LedgerStore] Loaded accounts:", accounts.length);
    } catch (error) {
      console.error("[LedgerStore] Failed to load accounts:", error);
      throw error;
    } finally {
      runInAction(() => {
        this.isLoadingAccounts = false;
      });
    }
  }

  async fetchPageAccounts(
    count: number = 5,
    startIndex: number = 0
  ): Promise<void> {
    if (!this.isConnected) {
      throw new Error(LEDGER_ERROR_MESSAGES.NOT_CONNECTED);
    }

    runInAction(() => {
      this.isLoadingAccounts = true;
    });

    try {
      const accounts = await ledgerService.getAccounts(startIndex, count);

      runInAction(() => {
        this.accounts = accounts;
      });

      console.log(
        "[LedgerStore] Fetched page accounts:",
        accounts.length,
        "startIndex:",
        startIndex
      );
    } catch (error) {
      console.error("[LedgerStore] Failed to fetch page accounts:", error);
      throw error;
    } finally {
      runInAction(() => {
        this.isLoadingAccounts = false;
      });
    }
  }

  async addAccount(verify: boolean = true): Promise<LedgerAccount> {
    if (!this.isConnected) {
      throw new Error(LEDGER_ERROR_MESSAGES.NOT_CONNECTED);
    }

    runInAction(() => {
      this.isLoadingAccounts = true;
    });

    try {
      const derivationPath = getDerivationPath(this.nextAccountIndex);

      // verifyAddress returns just the address string, getAddress returns full account data
      const address = verify
        ? await ledgerService.verifyAddress(derivationPath)
        : (await ledgerService.getAddress(derivationPath, false)).address;

      const { publicKey } = await ledgerService.getPublicKey(derivationPath);

      const newAccount: LedgerAccount = {
        address,
        derivationPath,
        publicKey,
        index: this.nextAccountIndex,
      };

      runInAction(() => {
        this.accounts = [...this.accounts, newAccount];
        this.nextAccountIndex += 1;
      });

      await StorageUtil.setLedgerAccounts(this.accounts);
      await StorageUtil.addLedgerAccountToAllAccounts(address);

      console.log("[LedgerStore] Added account:", newAccount.address);
      return newAccount;
    } catch (error) {
      console.error("[LedgerStore] Failed to add account:", error);
      throw error;
    } finally {
      runInAction(() => {
        this.isLoadingAccounts = false;
      });
    }
  }

  async removeAccount(address: string): Promise<void> {
    runInAction(() => {
      this.accounts = this.accounts.filter(
        (a) => a.address.toLowerCase() !== address.toLowerCase()
      );
    });

    await StorageUtil.setLedgerAccounts(this.accounts);
    await StorageUtil.removeLedgerAccountFromAllAccounts(address);

    console.log("[LedgerStore] Removed account:", address);
  }

  async verifyAddress(address: string): Promise<boolean> {
    if (!this.isConnected) {
      throw new Error(LEDGER_ERROR_MESSAGES.NOT_CONNECTED);
    }

    const account = this.accounts.find(
      (a) => a.address.toLowerCase() === address.toLowerCase()
    );

    if (!account) {
      console.warn("[LedgerStore] Account not found for verification:", address);
      return false;
    }

    try {
      await ledgerService.verifyAddress(account.derivationPath);
      return true;
    } catch (error) {
      console.error("[LedgerStore] Address verification failed:", error);
      throw error;
    }
  }

  getAccountByAddress(address: string): LedgerAccount | undefined {
    return this.accounts.find(
      (a) => a.address.toLowerCase() === address.toLowerCase()
    );
  }

  isLedgerAccount(address: string): boolean {
    return this.getAccountByAddress(address) !== undefined;
  }

  /**
   * Fetch and update public key for a Ledger account.
   * This is needed when accounts were loaded without public keys.
   */
  async fetchPublicKey(address: string): Promise<{ publicKey: string }> {
    const account = this.getAccountByAddress(address);
    if (!account) {
      throw new Error(`Account ${address} not found`);
    }

    if (!this.isConnected) {
      await this.connect();
    }

    const { publicKey } = await ledgerService.getPublicKey(account.derivationPath);

    // Update account with public key
    runInAction(() => {
      const idx = this.accounts.findIndex(
        (a) => a.address.toLowerCase() === address.toLowerCase()
      );
      if (idx >= 0) {
        this.accounts[idx] = { ...this.accounts[idx], publicKey };
      }
    });

    // Persist updated accounts
    await StorageUtil.setLedgerAccounts(this.accounts);

    console.log("[LedgerStore] Fetched and stored public key for:", address);
    return { publicKey };
  }

  /**
   * Sign a transaction using Ledger device.
   *
   * @param fromAddress - Address of the Ledger account to sign with
   * @param rlpEncodedTx - RLP-encoded transaction as hex string (with or without 0x prefix)
   *
   * NOTE: The caller is responsible for RLP-encoding the transaction before passing it here.
   * Use @theqrl/web3 or similar library for transaction serialization.
   */
  async signTransaction(
    fromAddress: string,
    rlpEncodedTx: string
  ): Promise<StoreSignResult> {
    const account = this.getAccountByAddress(fromAddress);
    console.log("[LedgerStore] Signing transaction for account:", fromAddress);
    if (!account) {
      const result: StoreSignResult = {
        success: false,
        error: `Account ${fromAddress} is not a Ledger account`,
      };
      runInAction(() => {
        this.signResult = result;
      });
      return result;
    }

    console.log("[LedgerStore] Preparing to sign RLP-encoded transaction");
    if (!this.isConnected) {
      try {
        await this.connect();
      } catch {
        const result: StoreSignResult = {
          success: false,
          error: LEDGER_ERROR_MESSAGES.NOT_CONNECTED,
        };
        runInAction(() => {
          this.signResult = result;
        });
        return result;
      }

      if (!this.isConnected) {
        const result: StoreSignResult = {
          success: false,
          error: LEDGER_ERROR_MESSAGES.NOT_CONNECTED,
        };
        runInAction(() => {
          this.signResult = result;
        });
        return result;
      }
    }

    console.log("[LedgerStore] Connected to Ledger, starting signing process");
    runInAction(() => {
      this.signingState = "awaiting_confirmation";
      this.signingStatus = {
        state: "awaiting_confirmation",
        message: "Please review and confirm the transaction on your Ledger device",
      };
      this.signResult = null;
    });

    try {
      console.log("[LedgerStore] Awaiting user confirmation on device");
      runInAction(() => {
        this.signingState = "signing";
        this.signingStatus = {
          state: "signing",
          message: "Signing transaction...",
        };
      });

      const signedResult = await ledgerService.signTransaction(
        account.derivationPath,
        rlpEncodedTx
      );

      console.log("[LedgerStore] Transaction signed, preparing result");
      const result: StoreSignResult = {
        success: true,
        signature: signedResult.signature,
        rawTransaction: signedResult.rawTransaction,
      };

      console.log("[LedgerStore] Signing successful:", result);
      runInAction(() => {
        this.signingState = "completed";
        this.signingStatus = {
          state: "completed",
          message: "Transaction signed successfully",
        };
        this.signResult = result;
      });

      console.log("[LedgerStore] Transaction signed successfully");
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : LEDGER_ERROR_MESSAGES.SIGNING_FAILED;

      const result: StoreSignResult = {
        success: false,
        error: errorMessage,
      };

      runInAction(() => {
        this.signingState = "error";
        this.signingStatus = {
          state: "error",
          message: errorMessage,
        };
        this.signResult = result;
      });

      console.error("[LedgerStore] Signing failed:", errorMessage);
      return result;
    }
  }

  /**
   * Signs a transaction on Ledger and returns the serialized signed transaction hex.
   * Handles the full flow: create unsigned tx → sign on Ledger → fetch public key → serialize.
   */
  async signAndSerializeTransaction(
    fromAddress: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txData: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    common: any,
  ): Promise<string> {
    const unsignedTx = FeeMarketEIP1559Transaction.fromTxData(txData, { common });
    const descriptor = newMLDSA87Descriptor().toBytes();
    const extraParams = new Uint8Array([]);
    const messageToSign = unsignedTx.getMessageToSign(descriptor, extraParams, false);
    const serializedTx = Buffer.from(messageToSign).toString("hex");

    const signResult = await this.signTransaction(fromAddress, serializedTx);
    if (!signResult.success) {
      throw new Error(signResult.error || "Ledger signing failed");
    }

    const account = this.getAccountByAddress(fromAddress);
    if (!account) {
      throw new Error("Ledger account not found");
    }

    let publicKey = account.publicKey;
    if (!publicKey) {
      const { publicKey: fetchedPublicKey } = await this.fetchPublicKey(fromAddress);
      publicKey = fetchedPublicKey;
      if (!publicKey) {
        throw new Error("Failed to fetch public key from Ledger");
      }
    }

    const rawValues = unsignedTx.raw();
    const signatureBytes = Buffer.from(signResult.signature!.replace("0x", ""), "hex");
    const publicKeyBytes = Buffer.from(publicKey.replace("0x", ""), "hex");

    const signedTxValues = [
      ...rawValues.slice(0, 9),
      descriptor,
      extraParams,
      signatureBytes,
      publicKeyBytes,
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signedTx = FeeMarketEIP1559Transaction.fromValuesArray(signedTxValues as any, { common });
    const signedRawTx = signedTx.serialize();
    return "0x" + Buffer.from(signedRawTx).toString("hex");
  }

  clearSigningState(): void {
    this.signingState = "idle";
    this.signingStatus = null;
    this.signResult = null;
  }
}

export const ledgerStore = new LedgerStore();
export default LedgerStore;
