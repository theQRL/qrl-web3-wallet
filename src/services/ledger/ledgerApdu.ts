/**
 * Helper functions for the APDU protocol.
 *
 * This file contains:
 * - Functions for building APDU commands
 * - Status code parser
 * - BIP-44 path utilities
 * - Functions for splitting data into chunks
 *
 * SEPARATION OF CONCERNS:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  LedgerService - business logic (getAccounts, signTx)       │
 * │      ↓                                                      │
 * │  LedgerApdu (this file) - APDU data formatting              │
 * │      ↓                                                      │
 * │  LedgerTransport - sending/receiving via WebHID             │
 * └─────────────────────────────────────────────────────────────┘
 *
 * APDU PROTOCOL - INTRODUCTION:
 * =============================
 *
 * Command APDU (sent to device):
 * ┌───────┬───────┬───────┬───────┬───────┬─────────────┐
 * │  CLA  │  INS  │  P1   │  P2   │  Lc   │    DATA     │
 * │  1B   │  1B   │  1B   │  1B   │  1B   │   0-255B    │
 * └───────┴───────┴───────┴───────┴───────┴─────────────┘
 *
 * - CLA: Class - application identifier (0xE0 for QRL Zond)
 * - INS: Instruction - operation code
 * - P1: Parameter 1 - operation modifier
 * - P2: Parameter 2 - additional modifier
 * - Lc: Length - DATA length
 * - DATA: Input data
 *
 * Response APDU (from device):
 * ┌─────────────────────────────┬───────────┬───────────┐
 * │            DATA             │    SW1    │    SW2    │
 * │          variable           │    1B     │    1B     │
 * └─────────────────────────────┴───────────┴───────────┘
 *
 * - DATA: Operation result
 * - SW1+SW2: Status Word (result code)
 */

import { QRL_ADDRESS_BYTES } from "@/constants/address";
import { LEDGER_CONFIG, LEDGER_ERRORS } from "@/constants/ledger";
import type { LedgerError } from "./ledgerTypes";

const QRL_ADDRESS_RESPONSE_LENGTH = 1 + QRL_ADDRESS_BYTES;

/**
 * Packs BIP-44 derivation path into Ledger APDU format.
 *
 * OUTPUT FORMAT:
 * ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
 * │  COUNT   │ PURPOSE  │COIN_TYPE │ ACCOUNT  │  CHANGE  │  INDEX   │
 * │   1B     │    4B    │    4B    │    4B    │    4B    │    4B    │
 * └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
 * = 21 bytes
 *
 * HARDENED PATHS:
 * Paths with apostrophe (e.g., 44') are "hardened" - they have 0x80000000 added.
 * Hardened keys don't allow deriving parent key from child.
 *
 * EXAMPLE:
 * "m/44'/238'/0'/0/0" →
 * [05] - 5 components
 * [80 00 00 2C] - 44 + 0x80000000 (hardened)
 * [80 00 00 EE] - 238 + 0x80000000 (hardened)
 * [80 00 00 00] - 0 + 0x80000000 (hardened)
 * [00 00 00 00] - 0 (not hardened)
 * [00 00 00 00] - 0 (not hardened)
 *
 * @param path - BIP-44 path, e.g., "m/44'/238'/0'/0/0"
 * @throws Error if path has invalid format
 * @returns Buffer of 21 bytes
 */
export function packDerivationPath(path: string): Buffer {
  // Remove "m/" prefix and split into components
  const parts = path.replace("m/", "").split("/");

  if (parts.length !== 5) {
    throw new Error(
      `Invalid derivation path: expected 5 components, got ${parts.length}. ` +
        `Valid format: m/44'/238'/0'/0/0`
    );
  }

  // Allocate buffer: 1 byte (count) + 5 * 4 bytes (components) = 21 bytes
  const buffer = Buffer.alloc(21);

  // First byte: number of components (always 5 for BIP-44)
  buffer.writeUInt8(5, 0);

  // Write each component as big-endian uint32
  parts.forEach((part, index) => {
    // Remove apostrophe and parse number
    const isHardened = part.endsWith("'");
    let value = parseInt(part.replace("'", ""), 10);

    if (isNaN(value)) {
      throw new Error(`Invalid path component: ${part}`);
    }

    // Add hardened offset if path ends with apostrophe
    if (isHardened) {
      value += LEDGER_CONFIG.HARDENED_OFFSET; // 0x80000000
    }

    // Write as big-endian (most significant byte first)
    buffer.writeUInt32BE(value, 1 + index * 4);
  });

  return buffer;
}

/**
 * Generates derivation path for given index.
 *
 * @param index - Address index (0, 1, 2, ...)
 * @returns Full BIP-44 path
 */
export function getDerivationPath(index: number): string {
  return `m/44'/${LEDGER_CONFIG.COIN_TYPE}'/0'/0/${index}`;
}

/**
 * Splits message into chunks of maximum size.
 *
 * CHUNKING PROTOCOL:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Transaction (e.g., 1000 bytes)                                 │
 * │     ↓                                                           │
 * │ ┌───────────┬───────────┬───────────┬───────────┐              │
 * │ │ Chunk 1   │ Chunk 2   │ Chunk 3   │ Chunk 4   │              │
 * │ │ 255B      │ 255B      │ 255B      │ 235B      │              │
 * │ │ P1=0x01   │ P1=0x01   │ P1=0x01   │ P1=0x02   │              │
 * │ │ (more)    │ (more)    │ (more)    │ (last)    │              │
 * │ └───────────┴───────────┴───────────┴───────────┘              │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * @param message - Data to split
 * @param maxSize - Maximum chunk size (default 255)
 * @returns Array of chunks
 */
export function splitIntoChunks(
  message: Buffer,
  maxSize: number = LEDGER_CONFIG.MAX_APDU_SIZE
): Buffer[] {
  const chunks: Buffer[] = [];

  for (let offset = 0; offset < message.length; offset += maxSize) {
    const end = Math.min(offset + maxSize, message.length);
    chunks.push(message.subarray(offset, end));
  }

  // If message is empty, return empty chunk
  if (chunks.length === 0) {
    chunks.push(Buffer.alloc(0));
  }

  return chunks;
}

/**
 * Combines signature chunks into single buffer.
 *
 * @param chunks - Array of signature chunks
 * @returns Combined signature
 */
export function combineSignatureChunks(chunks: Buffer[]): Buffer {
  return Buffer.concat(chunks);
}

/**
 * Checks Status Word from APDU response.
 *
 * COMMON STATUS CODES:
 * ┌────────┬─────────────────────────────────────────────────────┐
 * │ 0x9000 │ Success                                             │
 * │ 0x6985 │ User rejected operation (DENY)                      │
 * │ 0x6A86 │ Invalid P1 or P2                                    │
 * │ 0x6D00 │ Unknown instruction (INS)                           │
 * │ 0x6E00 │ Invalid CLA (wrong app open)                        │
 * │ 0xB005 │ Transaction parsing error                           │
 * │ 0xB008 │ Signing error                                       │
 * └────────┴─────────────────────────────────────────────────────┘
 *
 * @param response - APDU response (DATA + SW1 + SW2)
 * @throws LedgerError if status is not OK
 */
export function checkStatusWord(response: Buffer): void {
  if (response.length < 2) {
    throw createLedgerError(0, "Invalid APDU response - too short");
  }

  // Status Word is last 2 bytes of response
  const sw = response.readUInt16BE(response.length - 2);

  if (sw !== LEDGER_CONFIG.STATUS.OK) {
    const errorMessage =
      LEDGER_ERRORS[sw] || `Unknown Ledger error: 0x${sw.toString(16)}`;
    throw createLedgerError(sw, errorMessage);
  }
}

/**
 * Extracts data from APDU response (removes Status Word).
 *
 * @param response - Full APDU response
 * @returns Data only (without SW1+SW2)
 */
export function extractResponseData(response: Buffer): Buffer {
  if (response.length < 2) {
    return Buffer.alloc(0);
  }
  // Remove last 2 bytes (Status Word)
  return response.subarray(0, response.length - 2);
}

/**
 * Creates Ledger error object with additional information.
 *
 * @param statusCode - APDU status code (can be 0 for low-level errors)
 * @param message - Error message
 * @returns LedgerError object
 */
export function createLedgerError(
  statusCode: number,
  message: string
): LedgerError {
  // Determine if error can be fixed by retrying
  const retryable = isRetryableError(statusCode);

  return {
    statusCode,
    message,
    retryable,
  };
}

/**
 * Checks if error can be fixed by retrying.
 *
 * WHEN TO RETRY:
 * - Communication errors (timeout, disconnect)
 * - Some device state errors
 *
 * WHEN NOT TO RETRY:
 * - User rejected (0x6985) - conscious decision
 * - Wrong app (0x6E00) - requires app change
 * - TX parsing error (0xB005) - data problem
 *
 * @param statusCode - APDU status code
 * @returns true if retry is worth attempting
 */
export function isRetryableError(statusCode: number): boolean {
  const nonRetryable: number[] = [
    LEDGER_CONFIG.STATUS.DENY, // User rejected
    LEDGER_CONFIG.STATUS.CLA_NOT_SUPPORTED, // Wrong app
    LEDGER_CONFIG.STATUS.INS_NOT_SUPPORTED, // Unknown instruction
    LEDGER_CONFIG.STATUS.TX_PARSING_FAIL, // Bad transaction data
  ];

  return !nonRetryable.includes(statusCode);
}

/**
 * Checks if Status Word indicates user rejection.
 *
 * @param statusCode - APDU status code
 * @returns true if user rejected operation
 */
export function isUserRejection(statusCode: number): boolean {
  return statusCode === LEDGER_CONFIG.STATUS.DENY;
}

/**
 * Checks if Status Word indicates wrong app.
 *
 * @param statusCode - APDU status code
 * @returns true if wrong app is open
 */
export function isWrongApp(statusCode: number): boolean {
  return statusCode === LEDGER_CONFIG.STATUS.CLA_NOT_SUPPORTED;
}

/**
 * Parses QRL address from GET_PUBLIC_KEY response.
 *
 * RESPONSE FORMAT (address only):
 * ┌────────┬───────────────────┬────────┐
 * │ PREFIX │     ADDRESS       │   SW   │
 * │  'Q'   │     64 bytes      │   2B   │
 * │  1B    │      (hex)        │        │
 * └────────┴───────────────────┴────────┘
 *
 * WHY 'Q' PREFIX:
 * QRL addresses start with 'Q' to distinguish them from Ethereum addresses.
 * This is part of QRL specification.
 *
 * @param response - APDU response from GET_PUBLIC_KEY
 * @returns Address in QRL format (Q + 128 hex characters)
 */
export function parseQrlAddress(response: Buffer): string {
  // Check status
  checkStatusWord(response);

  // Extract data
  const data = extractResponseData(response);

  // QRL address: 1 byte prefix ('Q') + 64 bytes address = 65 bytes
  // Exact, not minimum. The fixed `subarray(1, 65)` below assumes precisely this
  // length, so a longer frame was silently truncated and a shorter one would have
  // absorbed adjacent payload into the address. See CIPH-QRLW326-37.
  if (data.length !== QRL_ADDRESS_RESPONSE_LENGTH) {
    throw createLedgerError(
      0,
      `Invalid response length: expected exactly ${QRL_ADDRESS_RESPONSE_LENGTH} bytes, got ${data.length}`
    );
  }

  // First byte is 'Q' prefix (0x51)
  const prefix = String.fromCharCode(data[0]);
  if (prefix !== "Q") {
    throw createLedgerError(
      0,
      `Invalid address prefix: expected 'Q', got '${prefix}'`
    );
  }

  // Next 64 bytes are the address (in hex)
  const addressBytes = data.subarray(1, QRL_ADDRESS_RESPONSE_LENGTH);
  const address = prefix + addressBytes.toString("hex");

  return address;
}

/**
 * Result of parsing GET_PUBLIC_KEY response with public key.
 */
export interface PublicKeyResponse {
  /** Address in QRL format (Q + 128 hex characters) */
  address: string;
  /** ML-DSA-87 public key (hex with 0x prefix), empty if not included in response */
  publicKey: string;
}

/**
 * Public key size in bytes.
 */
/** ML-DSA-87 public key size in bytes (FIPS 204). Was wrongly 2528. */
export const ML_DSA_87_PUBLIC_KEY_SIZE = 2592;

/** @deprecated Misnamed and wrong-valued; use ML_DSA_87_PUBLIC_KEY_SIZE. */
export const DILITHIUM_PUBLIC_KEY_SIZE = ML_DSA_87_PUBLIC_KEY_SIZE;

/**
 * Parses full GET_PUBLIC_KEY response including public key.
 *
 * RESPONSE FORMAT (with public key):
 * ┌────────┬───────────────────┬────────────────────┬────────┐
 * │ PREFIX │     ADDRESS       │    PUBLIC_KEY      │   SW   │
 * │  'Q'   │     64 bytes      │    2592 bytes      │   2B   │
 * │  1B    │      (hex)        │                    │        │
 * └────────┴───────────────────┴────────────────────┴────────┘
 *
 * @param response - APDU response from GET_PUBLIC_KEY
 * @returns Object with address and public key
 */
export function parsePublicKeyResponse(response: Buffer): PublicKeyResponse {
  // Check status
  checkStatusWord(response);

  // Extract data
  const data = extractResponseData(response);

  // QRL address: 1 byte prefix ('Q') + 64 bytes address = 65 bytes. A minimum
  // rather than an exact length is correct here — unlike `parseQrlAddress`, this
  // response legitimately carries the public key concatenated after the address.
  if (data.length < QRL_ADDRESS_RESPONSE_LENGTH) {
    throw createLedgerError(
      0,
      `Invalid response length: expected min. ${QRL_ADDRESS_RESPONSE_LENGTH} bytes, got ${data.length}`
    );
  }

  // First byte is 'Q' prefix (0x51)
  const prefix = String.fromCharCode(data[0]);
  if (prefix !== "Q") {
    throw createLedgerError(
      0,
      `Invalid address prefix: expected 'Q', got '${prefix}'`
    );
  }

  // Next 64 bytes are the address (in hex)
  const addressBytes = data.subarray(1, QRL_ADDRESS_RESPONSE_LENGTH);
  const address = prefix + addressBytes.toString("hex");

  // Remaining bytes are the public key (if present). Validate its length rather
  // than accepting whatever trails the address: any extra bytes used to become
  // "the public key" unchecked, so a malformed or truncated frame yielded a
  // silently wrong key. See CIPH-QRLW326-37.
  let publicKey = "";
  if (data.length > QRL_ADDRESS_RESPONSE_LENGTH) {
    const publicKeyBytes = data.subarray(QRL_ADDRESS_RESPONSE_LENGTH);
    if (publicKeyBytes.length !== ML_DSA_87_PUBLIC_KEY_SIZE) {
      throw createLedgerError(
        0,
        `Invalid public key length: expected ${ML_DSA_87_PUBLIC_KEY_SIZE} bytes, got ${publicKeyBytes.length}`
      );
    }
    publicKey = "0x" + publicKeyBytes.toString("hex");
  }

  return { address, publicKey };
}

/**
 * Parses app version from GET_VERSION response.
 *
 * RESPONSE FORMAT:
 * ┌───────┬───────┬───────┬────────┐
 * │ MAJOR │ MINOR │ PATCH │   SW   │
 * │  1B   │  1B   │  1B   │   2B   │
 * └───────┴───────┴───────┴────────┘
 *
 * @param response - APDU response from GET_VERSION
 * @returns String in format "major.minor.patch"
 */
export function parseAppVersion(response: Buffer): string {
  checkStatusWord(response);

  const data = extractResponseData(response);

  if (data.length < 3) {
    throw createLedgerError(
      0,
      `Invalid version response length: expected min. 3 bytes`
    );
  }

  const major = data[0];
  const minor = data[1];
  const patch = data[2];

  return `${major}.${minor}.${patch}`;
}

/**
 * Parses app name from GET_APP_NAME response.
 *
 * RESPONSE FORMAT:
 * ┌─────────────────────┬────────┐
 * │     APP_NAME        │   SW   │
 * │   variable ASCII    │   2B   │
 * └─────────────────────┴────────┘
 *
 * @param response - APDU response from GET_APP_NAME
 * @returns App name (e.g., "QRL Zond")
 */
export function parseAppName(response: Buffer): string {
  checkStatusWord(response);

  const data = extractResponseData(response);

  return data.toString("ascii");
}

/**
 * Converts hex string to Buffer.
 *
 * @param hex - Hex string (with or without 0x prefix)
 * @returns Buffer with binary data
 */
export function hexToBuffer(hex: string): Buffer {
  const cleanHex = hex.replace(/^0x/, "");
  return Buffer.from(cleanHex, "hex");
}

/**
 * Converts Buffer to hex string with 0x prefix.
 *
 * @param buffer - Buffer to convert
 * @returns Hex string with 0x prefix
 */
export function bufferToHex(buffer: Buffer): string {
  return "0x" + buffer.toString("hex");
}
