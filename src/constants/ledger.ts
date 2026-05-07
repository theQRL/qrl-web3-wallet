/**
 * Configuration constants for Ledger Hardware Wallet integration.
 *
 * Values compliant with the Ledger QRL Zond application specification.
 * Documentation: docs/LEDGER_INTEGRATION_GUIDE.md
 */

/**
 * Main Ledger configuration.
 */
export const LEDGER_CONFIG = {
  /**
   * Class byte - QRL Zond application identifier on Ledger.
   * Value 0xE0 is standard for blockchain applications.
   */
  CLA: 0xe0,

  /**
   * APDU instruction codes (INS).
   * Each operation on Ledger has its unique code.
   */
  INS: {
    /** Gets the Ledger application version (major.minor.patch) */
    GET_VERSION: 0x03,
    /** Gets the application name (e.g., "QRL Zond") */
    GET_APP_NAME: 0x04,
    /** Gets the public address for a given BIP-44 path */
    GET_PUBLIC_KEY: 0x05,
    /** Signs a transaction using Dilithium key */
    SIGN_TX: 0x06,
  },

  /**
   * P1 parameters for various operations.
   * P1 specifies the instruction mode.
   */
  P1: {
    /** First packet / no confirmation on screen */
    START: 0x00,
    /** Requires address confirmation on Ledger screen */
    CONFIRM: 0x01,
    /** Transaction data continuation (middle packets) */
    MORE_TX: 0x01,
    /** Last transaction data packet */
    LAST_TX: 0x02,
  },

  /**
   * P2 parameters.
   * P2 usually specifies whether more packets follow.
   */
  P2: {
    /** Last packet */
    LAST: 0x00,
    /** More packets follow */
    MORE: 0x80,
  },

  /**
   * Default derivation path for QRL Zond (BIP-44).
   *
   * Format: m/purpose'/coin_type'/account'/change/address_index
   * - 44' = BIP-44 standard
   * - 238' = QRL coin type (registered in SLIP-0044)
   * - 0' = first account
   * - 0 = external chain (not change addresses)
   * - 0 = first address
   */
  DEFAULT_DERIVATION_PATH: "m/44'/238'/0'/0/0",

  /** Coin type for QRL in BIP-44/SLIP-0044 standard */
  COIN_TYPE: 238,

  /** Coin type with hardened bit (0x80000000 | 238) */
  COIN_TYPE_HEX: 0x800000ee,

  /**
   * Hardened offset for BIP-32/BIP-44.
   * Paths with apostrophe (e.g., 44') have 0x80000000 added.
   */
  HARDENED_OFFSET: 0x80000000,

  /**
   * APDU response status codes (SW1 || SW2).
   */
  STATUS: {
    /** Operation completed successfully */
    OK: 0x9000,
    /** User rejected the operation on device */
    DENY: 0x6985,
    /** Invalid P1 or P2 parameters */
    WRONG_P1P2: 0x6a86,
    /** Invalid input data length */
    WRONG_DATA_LENGTH: 0x6a87,
    /** Unknown instruction (INS) */
    INS_NOT_SUPPORTED: 0x6d00,
    /** Invalid CLA - probably wrong application open */
    CLA_NOT_SUPPORTED: 0x6e00,
    /** Wrong response length */
    WRONG_RESPONSE_LENGTH: 0xb000,
    /** BIP32 path display error */
    DISPLAY_BIP32_PATH_FAIL: 0xb001,
    /** Address display error */
    DISPLAY_ADDRESS_FAIL: 0xb002,
    /** Amount display error */
    DISPLAY_AMOUNT_FAIL: 0xb003,
    /** Invalid transaction length */
    WRONG_TX_LENGTH: 0xb004,
    /** Transaction parsing error */
    TX_PARSING_FAIL: 0xb005,
    /** Transaction hashing error */
    TX_HASH_FAIL: 0xb006,
    /** Security error - invalid state */
    BAD_STATE: 0xb007,
    /** Signing error */
    SIGNATURE_FAIL: 0xb008,
  },

  /**
   * Operation timeouts (in milliseconds).
   */
  CONNECTION_TIMEOUT: 30000,
  SIGNING_TIMEOUT: 120000,

  /**
   * Maximum size of a single APDU packet.
   * ISO 7816-4 protocol limitation.
   */
  MAX_APDU_SIZE: 255,

  /**
   * Dilithium signature parameters.
   *
   * Dilithium signature is ~2420 bytes (vs 65B for ECDSA in Ethereum).
   * It doesn't fit in a single APDU response (max 255B).
   * We need to retrieve it in 18 chunks.
   */
  SIGNATURE_CHUNKS: 18,
  MAX_CHUNK_SIZE: 258,

  /**
   * Reassembly bounds for chunked APDU responses.
   *
   * - Public key: ML-DSA-87 keys are exactly 2592 bytes; the device returns
   *   them as 10×258 + 1×12 chunks (`PK_CHUNKS = 11`).
   * - Signature: ML-DSA-87 signatures are variable up to ~2420 bytes;
   *   bound by an inclusive range to reject malformed reassemblies.
   */
  EXPECTED_PUBLIC_KEY_BYTES: 2592,
  PUBLIC_KEY_CHUNK_BYTES: 258,
  PUBLIC_KEY_LAST_CHUNK_BYTES: 12,
  SIGNATURE_MIN_BYTES: 1024,
  SIGNATURE_MAX_BYTES: 4096,
} as const;

/**
 * Mapping of error codes to user messages.
 * Used in UI to display understandable errors.
 */
export const LEDGER_ERRORS: Record<number, string> = {
  [LEDGER_CONFIG.STATUS.DENY]:
    "Transaction was rejected on the Ledger device",
  [LEDGER_CONFIG.STATUS.WRONG_P1P2]: "Invalid operation parameters",
  [LEDGER_CONFIG.STATUS.WRONG_DATA_LENGTH]: "Invalid data length",
  [LEDGER_CONFIG.STATUS.INS_NOT_SUPPORTED]:
    "Unsupported operation - check the QRL Zond app version on your Ledger",
  [LEDGER_CONFIG.STATUS.CLA_NOT_SUPPORTED]:
    "Invalid application - open the QRL Zond app on your Ledger device",
  [LEDGER_CONFIG.STATUS.TX_PARSING_FAIL]:
    "Transaction parsing error - invalid format",
  [LEDGER_CONFIG.STATUS.TX_HASH_FAIL]: "Transaction hashing error",
  [LEDGER_CONFIG.STATUS.SIGNATURE_FAIL]:
    "Transaction signing error on device",
  [LEDGER_CONFIG.STATUS.BAD_STATE]:
    "Security error - device in invalid state",
};

/**
 * High-level error messages.
 * Used when we don't have an APDU status code.
 */
export const LEDGER_ERROR_MESSAGES = {
  /** No Ledger device detected */
  DEVICE_NOT_FOUND:
    "Ledger device not found. Make sure it is connected via USB.",
  /** Device connected but QRL Zond app not open */
  APP_NOT_OPEN:
    "Open the QRL Zond app on your Ledger device and try again.",
  /** User rejected operation with button on device */
  USER_REJECTED: "Operation was rejected on the Ledger device.",
  /** General connection error */
  CONNECTION_FAILED:
    "Failed to connect to Ledger device. Check the USB connection.",
  /** Error during signing */
  SIGNING_FAILED:
    "Failed to sign transaction on Ledger device. Please try again.",
  /** Operation timeout exceeded */
  TIMEOUT: "Timed out waiting for Ledger device response.",
  /** Browser doesn't support WebHID */
  WEBHID_NOT_SUPPORTED:
    "Your browser doesn't support WebHID. Use Chrome, Edge, or Brave.",
  /** Device was disconnected during operation */
  DEVICE_DISCONNECTED:
    "Ledger device was disconnected. Please reconnect it.",
  /** Device not connected - operation requires connection */
  NOT_CONNECTED:
    "Ledger device is not connected. Please connect your device first.",
  /** Device returned data of unexpected size during chunk reassembly */
  INCONSISTENT_DEVICE_RESPONSE:
    "Ledger device returned an unexpected response. Reconnect the device or check the QRL Zond app firmware version.",
} as const;

/**
 * Account types in the wallet.
 * Used to distinguish local accounts from Ledger accounts.
 */
export const ACCOUNT_TYPES = {
  /** Account with local key (mnemonic/seed) */
  LOCAL: "local",
  /** Account from Ledger device */
  LEDGER: "ledger",
} as const;
