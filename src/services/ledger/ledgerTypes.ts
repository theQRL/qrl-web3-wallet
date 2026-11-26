/**
 * TypeScript types for Ledger Hardware Wallet integration.
 */

import { ACCOUNT_TYPES } from "@/constants/ledger";

/**
 * Ledger device information.
 * Returned after successful connection to the device.
 */
export interface LedgerDeviceInfo {
  /** Device model (e.g., "Ledger Nano S", "Ledger Nano X") */
  model: string;
  /** QRL Zond app version on the device (e.g., "1.0.0") */
  version: string;
  /** Whether the device is currently connected */
  connected: boolean;
}

/**
 * Ledger account - data stored in storage and used for signing.
 */
export interface LedgerAccount {
  /** Account address in QRL format (Q + 128 hex characters) */
  address: string;
  /** BIP-44 path, e.g., "m/44'/238'/0'/0/0" */
  derivationPath: string;
  /** Public key (hex) - optional, because ML-DSA-87 keys are large (2592 bytes) */
  publicKey: string;
  /** Address index on the derivation path (0, 1, 2, ...) */
  index: number;
}

/**
 * Ledger account data stored in browser storage.
 * Without index - index is calculated dynamically.
 */
export interface StoredLedgerAccount {
  address: string;
  derivationPath: string;
  publicKey: string;
}

/**
 * Signing operation status.
 *
 * SIGNING FLOW:
 * 1. idle → connecting (establishing connection with Ledger)
 * 2. connecting → awaiting_confirmation (TX sent, waiting for approval)
 * 3. awaiting_confirmation → success/rejected/error (operation result)
 *
 * UI uses these statuses to display appropriate modals/spinners.
 */
export type LedgerSigningStatus =
  | "idle" // No active operation
  | "connecting" // Establishing connection with device
  | "awaiting_confirmation" // Waiting for approval on Ledger screen
  | "success" // Signed successfully
  | "rejected" // User rejected on device
  | "error"; // An error occurred

/**
 * Transaction signing operation result.
 */
export interface LedgerSignResult {
  /** Raw transaction (hex with 0x prefix) */
  rawTransaction: string;
  /** Signature (hex with 0x prefix) - 4627 bytes for ML-DSA-87 */
  signature: string;
  /** Public key used for signing (optional) */
  publicKey?: string;
}

/**
 * Message signing operation result.
 */
export interface LedgerMessageSignResult {
  /** Message signature (hex) */
  signature: string;
}

/**
 * Ledger connection state.
 */
export type LedgerConnectionState =
  | "disconnected" // No connection
  | "connecting" // Connection attempt
  | "connected" // Connected
  | "wrong_app" // Connected, but wrong app open
  | "error"; // Connection error

/**
 * Ledger error with additional information.
 */
export interface LedgerError {
  /** APDU error code (e.g., 0x6985) */
  statusCode?: number;
  /** Error message for the user */
  message: string;
  /** Whether the error can be fixed by retrying */
  retryable: boolean;
}

/**
 * Options for getPublicKey operation.
 */
export interface GetPublicKeyOptions {
  /** BIP-44 path */
  derivationPath: string;
  /** Whether to display address on Ledger screen for verification */
  confirm?: boolean;
}

/**
 * Options for signTransaction operation.
 */
export interface SignTransactionOptions {
  /** BIP-44 path of the signing key */
  derivationPath: string;
  /** RLP-encoded transaction (hex or Buffer) */
  transaction: string | Buffer;
}

/**
 * Account type - local or Ledger.
 * Used to distinguish signing method.
 */
export type AccountType = (typeof ACCOUNT_TYPES)[keyof typeof ACCOUNT_TYPES];

/**
 * Extended account information with type.
 */
export interface AccountWithType {
  address: string;
  type: AccountType;
  /** Additional data for Ledger accounts */
  ledgerData?: StoredLedgerAccount;
}

/**
 * Parameters for fetching multiple accounts from Ledger.
 */
export interface FetchAccountsParams {
  /** Start index (default 0) */
  startIndex?: number;
  /** Number of accounts to fetch (default 5) */
  count?: number;
}

/**
 * Callback for Ledger events.
 */
export interface LedgerEventCallbacks {
  /** Device was connected */
  onConnect?: (info: LedgerDeviceInfo) => void;
  /** Device was disconnected */
  onDisconnect?: () => void;
  /** Signing status changed */
  onSigningStatusChange?: (status: LedgerSigningStatus) => void;
  /** An error occurred */
  onError?: (error: LedgerError) => void;
}

/**
 * Ledger service configuration.
 */
export interface LedgerServiceConfig {
  /** Connection timeout (ms) */
  connectionTimeout?: number;
  /** Signing timeout (ms) */
  signingTimeout?: number;
  /** Event callbacks */
  callbacks?: LedgerEventCallbacks;
}
