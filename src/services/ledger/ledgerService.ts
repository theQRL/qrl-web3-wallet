/**
 * Main Ledger Service - high-level API.
 *
 * WHY THIS FILE IS NEEDED:
 * ========================
 * This service is the main entry point for Ledger functionality.
 * It hides APDU protocol and WebHID transport details behind a simple API.
 *
 * LAYERED ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  UI Components / Store                                         │
 * │      ↓ simple interface: connect(), getAccounts(), signTx()    │
 * │  LedgerService (this file)                                     │
 * │      ↓ data formatting, error handling                         │
 * │  LedgerApdu (APDU helpers)                                     │
 * │      ↓ packing/parsing APDU commands                           │
 * │  LedgerTransport (WebHID wrapper)                              │
 * │      ↓ low-level USB communication                             │
 * │  Ledger Device                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * IMPLEMENTATION BASED ON SPECIFICATION:
 * ~/zond-testnetv1/ledger-app-zond/APP_SPECIFICATION.md
 *
 * AVAILABLE OPERATIONS IN LEDGER ZOND APP:
 * - GET_VERSION (0x03) - get app version
 * - GET_APP_NAME (0x04) - get app name
 * - GET_PUBLIC_KEY (0x05) - get address for BIP-44 path
 * - SIGN_TX (0x06) - sign transaction
 *
 * NOTE: Ledger QRL app does NOT support personal_sign (message signing).
 */

import { ledgerTransport } from "./ledgerTransport";
import {
  packDerivationPath,
  getDerivationPath,
  splitIntoChunks,
  combineSignatureChunks,
  parseQrlAddress,
  parsePublicKeyResponse,
  parseAppVersion,
  parseAppName,
  checkStatusWord,
  extractResponseData,
  isUserRejection,
  isWrongApp,
  hexToBuffer,
  bufferToHex,
} from "./ledgerApdu";
import { LEDGER_CONFIG, LEDGER_ERROR_MESSAGES } from "@/constants/ledger";
import type {
  LedgerAccount,
  LedgerDeviceInfo,
  LedgerSignResult,
  LedgerServiceConfig,
  LedgerEventCallbacks,
} from "./ledgerTypes";

/**
 * Main Ledger Service.
 *
 * RESPONSIBILITIES:
 * - Managing device connection
 * - Fetching app information (version, name)
 * - Fetching addresses from device
 * - Signing transactions
 * - Error handling and mapping to user messages
 *
 * SINGLETON PATTERN:
 * Service is a singleton (single instance) because:
 * - Operations must be sequential (one transaction at a time)
 * - Connection state must be shared
 * - Prevents conflicts during concurrent operations
 *
 * USAGE:
 * ```typescript
 * import { ledgerService } from "@/services/ledger";
 *
 * // Connect and get info
 * const info = await ledgerService.connect();
 * console.log(`Connected to ${info.model}, version ${info.version}`);
 *
 * // Get accounts
 * const accounts = await ledgerService.getAccounts(0, 5);
 *
 * // Sign transaction
 * const result = await ledgerService.signTransaction(
 *   accounts[0].derivationPath,
 *   rlpEncodedTransaction
 * );
 * ```
 */
class LedgerService {
  /** Service configuration (for future extensions) */
  private _config: LedgerServiceConfig;

  /** Event callbacks */
  private callbacks: LedgerEventCallbacks;

  constructor(config?: LedgerServiceConfig) {
    this._config = {
      connectionTimeout:
        config?.connectionTimeout || LEDGER_CONFIG.CONNECTION_TIMEOUT,
      signingTimeout:
        config?.signingTimeout || LEDGER_CONFIG.SIGNING_TIMEOUT,
    };
    this.callbacks = config?.callbacks || {};

    // Register disconnect handler
    ledgerTransport.onDisconnect(() => {
      if (this.callbacks.onDisconnect) {
        this.callbacks.onDisconnect();
      }
    });
  }

  /**
   * Returns current service configuration.
   */
  getConfig(): LedgerServiceConfig {
    return this._config;
  }

  /**
   * Checks if browser supports WebHID.
   */
  isSupported(): boolean {
    return ledgerTransport.isSupported();
  }

  /**
   * Checks if device is connected.
   */
  isConnected(): boolean {
    return ledgerTransport.isConnected();
  }

  /**
   * Connects to Ledger device and fetches app information.
   *
   * FLOW:
   * 1. Establish WebHID connection (requires user gesture!)
   * 2. Send GET_VERSION to confirm QRL Zond app is open
   * 3. If CLA not supported → wrong app is open
   * 4. Return device information
   *
   * WHY GET_VERSION FIRST:
   * - Verifies that QRL Zond app is open
   * - Allows checking version (important for compatibility)
   * - Fast operation without displaying on Ledger screen
   *
   * @throws Error if connection fails or wrong app
   * @returns Device and app information
   */
  async connect(): Promise<LedgerDeviceInfo> {
    try {
      // Establish WebHID connection
      await ledgerTransport.connect();

      // Send GET_VERSION to verify app
      const response = await ledgerTransport.send(
        LEDGER_CONFIG.CLA,
        LEDGER_CONFIG.INS.GET_VERSION,
        LEDGER_CONFIG.P1.START,
        LEDGER_CONFIG.P2.LAST
      );

      // Parse response
      const version = parseAppVersion(response);

      const info: LedgerDeviceInfo = {
        model: "Ledger Nano", // WebHID doesn't return model, use generic name
        version,
        connected: true,
      };

      // Call callback
      if (this.callbacks.onConnect) {
        this.callbacks.onConnect(info);
      }

      return info;
    } catch (error: unknown) {
      // Check error type
      if (error && typeof error === "object" && "statusCode" in error) {
        const statusCode = (error as { statusCode: number }).statusCode;
        if (isWrongApp(statusCode)) {
          throw new Error(LEDGER_ERROR_MESSAGES.APP_NOT_OPEN);
        }
      }

      // Rethrow error
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(LEDGER_ERROR_MESSAGES.CONNECTION_FAILED);
    }
  }

  /**
   * Fetches app name from device.
   *
   * APDU: CLA=0xE0, INS=0x04, P1=0x00, P2=0x00
   *
   * WHY THIS CAN BE USEFUL:
   * - Verify correct app is open
   * - Display name to user
   * - Debugging
   *
   * @returns App name (e.g., "QRL Zond")
   */
  async getAppName(): Promise<string> {
    const response = await ledgerTransport.send(
      LEDGER_CONFIG.CLA,
      LEDGER_CONFIG.INS.GET_APP_NAME,
      LEDGER_CONFIG.P1.START,
      LEDGER_CONFIG.P2.LAST
    );

    return parseAppName(response);
  }

  /**
   * Disconnects the device.
   *
   * WHEN TO CALL:
   * - User wants to disconnect
   * - Before closing application
   * - After critical error
   */
  async disconnect(): Promise<void> {
    await ledgerTransport.disconnect();
  }

  /**
   * Fetches list of accounts from device.
   *
   * FLOW FOR EACH ACCOUNT:
   * 1. Generate BIP-44 path: m/44'/238'/0'/0/{index}
   * 2. Send GET_PUBLIC_KEY
   * 3. Ledger derives key and computes address
   * 4. Parse response and return address
   *
   * NOTE - PERFORMANCE:
   * Each address fetch requires separate communication with Ledger.
   * Fetching 5 accounts takes ~2-3 seconds.
   * Uses getAddress() internally for faster fetching (no public key).
   *
   * @param startIndex - Starting index (default 0)
   * @param count - Number of accounts to fetch (default 5)
   * @returns List of accounts with addresses and paths
   */
  async getAccounts(
    startIndex: number = 0,
    count: number = 5
  ): Promise<LedgerAccount[]> {
    const accounts: LedgerAccount[] = [];

    for (let i = startIndex; i < startIndex + count; i++) {
      const path = getDerivationPath(i);
      const account = await this.getAddress(path, false);

      accounts.push({
        ...account,
        index: i,
      });
    }

    return accounts;
  }

  /**
   * Fetches address for given derivation path (without public key).
   *
   * This is a fast operation that only returns the address.
   * Use getPublicKey() if you need the full Dilithium public key.
   *
   * GET_PUBLIC_KEY PROTOCOL:
   * ========================
   *
   * REQUEST:
   * ┌──────┬──────┬──────┬──────┬──────┬─────────────────────┐
   * │ CLA  │ INS  │  P1  │  P2  │  Lc  │   DATA (path)       │
   * │ 0xE0 │ 0x05 │ 0/1  │ 0x00 │ 0x15 │ [21 bytes path]     │
   * └──────┴──────┴──────┴──────┴──────┴─────────────────────┘
   *
   * P1 = 0x00: Don't display address (fast)
   * P1 = 0x01: Display address on Ledger screen (requires confirmation)
   *
   * RESPONSE:
   * ┌────────┬───────────────────┬────────┐
   * │ PREFIX │     ADDRESS       │   SW   │
   * │  'Q'   │    20 bytes       │ 0x9000 │
   * └────────┴───────────────────┴────────┘
   *
   * @param derivationPath - BIP-44 path, e.g., "m/44'/238'/0'/0/0"
   * @param confirm - Whether to display address on Ledger screen
   * @returns Address and path (without public key)
   */
  async getAddress(
    derivationPath: string,
    confirm: boolean = false
  ): Promise<Omit<LedgerAccount, "index">> {
    // Pack path to APDU format
    const pathBuffer = packDerivationPath(derivationPath);

    // Send command
    const response = await ledgerTransport.send(
      LEDGER_CONFIG.CLA,
      LEDGER_CONFIG.INS.GET_PUBLIC_KEY,
      confirm ? LEDGER_CONFIG.P1.CONFIRM : LEDGER_CONFIG.P1.START,
      LEDGER_CONFIG.P2.LAST,
      pathBuffer
    );

    // Parse address from response
    const address = parseQrlAddress(response);

    return {
      address,
      derivationPath,
      publicKey: "",
    };
  }

  /**
   * Fetches public key and address for given derivation path.
   *
   * NOTE - RESPONSE SIZE:
   * Public key is ~2.5KB (vs 33 bytes for ECDSA in Ethereum).
   * This operation returns more data than getAddress().
   * Use getAddress() if you only need the address.
   *
   * RESPONSE FORMAT (with public key):
   * ┌────────┬───────────────────┬─────────────────────┬────────┐
   * │ PREFIX │     ADDRESS       │     PUBLIC_KEY      │   SW   │
   * │  'Q'   │    20 bytes       │     2528 bytes      │   2B   │
   * │  1B    │    (hex)          │                     │        │
   * └────────┴───────────────────┴─────────────────────┴────────┘
   *
   * @param derivationPath - BIP-44 path, e.g., "m/44'/238'/0'/0/0"
   * @param confirm - Whether to display address on Ledger screen
   * @returns Address, derivation path, and public key (hex with 0x prefix)
   */
  async getPublicKey(
    derivationPath: string,
    confirm: boolean = false
  ): Promise<Omit<LedgerAccount, "index">> {
    // Pack path to APDU format
    const pathBuffer = packDerivationPath(derivationPath);

    // Step 1: Send GET_PUBLIC_KEY with P2=0 to derive key and get address
    const addressResponse = await ledgerTransport.send(
      LEDGER_CONFIG.CLA,
      LEDGER_CONFIG.INS.GET_PUBLIC_KEY,
      confirm ? LEDGER_CONFIG.P1.CONFIRM : LEDGER_CONFIG.P1.START,
      0x00, // P2=0: derive key and return address
      pathBuffer
    );

    // Parse address from response
    const { address } = parsePublicKeyResponse(addressResponse);

    // Step 2: Fetch public key in chunks (P2=1-11 for chunks 0-10)
    // Total: 2592 bytes = 10 chunks of 258 bytes + 1 chunk of 12 bytes
    const PK_CHUNKS = 11;
    const publicKeyChunks: Buffer[] = [];

    for (let chunkIndex = 0; chunkIndex < PK_CHUNKS; chunkIndex++) {
      const chunkResponse = await ledgerTransport.send(
        LEDGER_CONFIG.CLA,
        LEDGER_CONFIG.INS.GET_PUBLIC_KEY,
        0x00, // P1 doesn't matter for chunk fetching
        chunkIndex + 1, // P2=1-11 for chunks 0-10
        Buffer.alloc(0) // No data needed
      );

      checkStatusWord(chunkResponse);
      const chunkData = extractResponseData(chunkResponse);
      // Per-chunk size validation: chunks 0-9 carry 258 bytes, chunk 10
      // carries 12 bytes. A device that returns a chunk of any other size
      // is misbehaving and the reassembly cannot be trusted.
      const expectedChunkBytes =
        chunkIndex === PK_CHUNKS - 1
          ? LEDGER_CONFIG.PUBLIC_KEY_LAST_CHUNK_BYTES
          : LEDGER_CONFIG.PUBLIC_KEY_CHUNK_BYTES;
      if (chunkData.length !== expectedChunkBytes) {
        throw new Error(LEDGER_ERROR_MESSAGES.INCONSISTENT_DEVICE_RESPONSE);
      }
      publicKeyChunks.push(chunkData);
    }

    // Combine chunks into full public key and assert exact length.
    // ML-DSA-87 public keys are exactly EXPECTED_PUBLIC_KEY_BYTES; reject
    // any deviation (F-12).
    const fullPublicKey = combineSignatureChunks(publicKeyChunks);
    if (fullPublicKey.length !== LEDGER_CONFIG.EXPECTED_PUBLIC_KEY_BYTES) {
      throw new Error(LEDGER_ERROR_MESSAGES.INCONSISTENT_DEVICE_RESPONSE);
    }
    const publicKey = bufferToHex(fullPublicKey);

    return {
      address,
      derivationPath,
      publicKey,
    };
  }

  /**
   * Verifies address on Ledger screen.
   *
   * FLOW:
   * 1. Send GET_PUBLIC_KEY with P1=0x01 (confirm)
   * 2. Ledger displays address on screen
   * 3. User verifies and approves/rejects
   * 4. We receive result
   *
   * @param derivationPath - Path to address
   * @returns Verified address
   * @throws Error if user rejects
   */
  async verifyAddress(derivationPath: string): Promise<string> {
    const result = await this.getAddress(derivationPath, true);
    return result.address;
  }

  /**
   * Signs transaction on Ledger device.
   *
   * Signing consists of several phases:
   *
   * Send BIP32 path
   * ┌──────┬──────┬──────┬──────┬──────┬─────────────────────┐
   * │ CLA  │ INS  │  P1  │  P2  │  Lc  │   DATA (path)       │
   * │ 0xE0 │ 0x06 │ 0x00 │ 0x00 │ 0x15 │ [21 bytes path]     │
   * └──────┴──────┴──────┴──────┴──────┴─────────────────────┘
   *
   * Send transaction data (chunks)
   * ┌──────┬──────┬──────┬──────┬──────┬─────────────────────┐
   * │ CLA  │ INS  │  P1  │  P2  │  Lc  │   DATA (tx chunk)   │
   * │ 0xE0 │ 0x06 │ 0x01 │ 0x00 │ var  │ [max 255 bytes]     │
   * └──────┴──────┴──────┴──────┴──────┴─────────────────────┘
   * P1=0x01 means "more transaction data"
   *
   * Send last chunk (triggers signing)
   * ┌──────┬──────┬──────┬──────┬──────┬─────────────────────┐
   * │ CLA  │ INS  │  P1  │  P2  │  Lc  │   DATA (last chunk) │
   * │ 0xE0 │ 0x06 │ 0x02 │ 0x00 │ var  │ [remaining bytes]   │
   * └──────┴──────┴──────┴──────┴──────┴─────────────────────┘
   * P1=0x02 means "last data, start signing"
   * At this stage Ledger displays TX on screen and waits for approval.
   *
   * Receive Dilithium signature chunks (~2420 bytes)
   * First chunk is returned automatically.
   * Remaining 17 chunks are fetched via:
   * ┌──────┬──────┬──────┬──────┬──────┬──────┐
   * │ CLA  │ INS  │  P1  │  P2  │  Lc  │ DATA │
   * │ 0xE0 │ 0x06 │ 0x02 │ 1-17 │ 0x00 │ none │
   * └──────┴──────┴──────┴──────┴──────┴──────┘
   * P2 = signature chunk number (1-17)
   *
   * @param derivationPath - BIP-44 path of signing key
   * @param rlpEncodedTx - RLP-encoded transaction (hex string or Buffer)
   * @returns Signed transaction with Dilithium signature
   */
  async signTransaction(
    derivationPath: string,
    rlpEncodedTx: string | Buffer
  ): Promise<LedgerSignResult> {
    // Convert input to Buffer
    const txBytes =
      typeof rlpEncodedTx === "string"
        ? hexToBuffer(rlpEncodedTx)
        : rlpEncodedTx;

    // Notify about start
    if (this.callbacks.onSigningStatusChange) {
      this.callbacks.onSigningStatusChange("connecting");
    }

    try {
      const pathBuffer = packDerivationPath(derivationPath);
      await ledgerTransport.send(
        LEDGER_CONFIG.CLA,
        LEDGER_CONFIG.INS.SIGN_TX,
        0x00, // P1: first packet (BIP32 path)
        0x00, // P2: last packet of this type
        pathBuffer
      );

      const txChunks = splitIntoChunks(txBytes, LEDGER_CONFIG.MAX_APDU_SIZE);

      // Send all chunks except last
      for (let i = 0; i < txChunks.length - 1; i++) {
        await ledgerTransport.send(
          LEDGER_CONFIG.CLA,
          LEDGER_CONFIG.INS.SIGN_TX,
          0x01, // P1: more transaction data
          0x00,
          txChunks[i]
        );
      }

      // Notify that we're waiting for user approval
      if (this.callbacks.onSigningStatusChange) {
        this.callbacks.onSigningStatusChange("awaiting_confirmation");
      }

      // Send last chunk - this triggers TX display on Ledger
      // and requires user approval
      const signatureResponse = await ledgerTransport.send(
        LEDGER_CONFIG.CLA,
        LEDGER_CONFIG.INS.SIGN_TX,
        0x02, // P1: last transaction data packet
        0x00,
        txChunks[txChunks.length - 1]
      );

      // Check status of first signature chunk
      checkStatusWord(signatureResponse);

      // Dilithium signature is returned in 18 chunks. Each chunk must be
      // non-empty; an empty chunk indicates a transport fault or padded
      // response that cannot be trusted (F-12).
      const firstChunk = extractResponseData(signatureResponse);
      if (firstChunk.length === 0) {
        throw new Error(LEDGER_ERROR_MESSAGES.INCONSISTENT_DEVICE_RESPONSE);
      }
      const signatureChunks: Buffer[] = [firstChunk];

      for (let chunkIndex = 1; chunkIndex < LEDGER_CONFIG.SIGNATURE_CHUNKS; chunkIndex++) {
        const chunkResponse = await ledgerTransport.send(
          LEDGER_CONFIG.CLA,
          LEDGER_CONFIG.INS.SIGN_TX,
          0x02, // P1: continue fetching signature
          chunkIndex, // P2: chunk number (1-17)
          Buffer.alloc(0) // No input data
        );

        checkStatusWord(chunkResponse);
        const chunkData = extractResponseData(chunkResponse);
        if (chunkData.length === 0) {
          throw new Error(LEDGER_ERROR_MESSAGES.INCONSISTENT_DEVICE_RESPONSE);
        }
        signatureChunks.push(chunkData);
      }

      // Combine all chunks. Bound the assembled length: ML-DSA-87 sigs sit
      // around 2420 bytes, with some implementation variance. Reject
      // responses outside the configured envelope.
      const fullSignature = combineSignatureChunks(signatureChunks);
      if (
        fullSignature.length < LEDGER_CONFIG.SIGNATURE_MIN_BYTES ||
        fullSignature.length > LEDGER_CONFIG.SIGNATURE_MAX_BYTES
      ) {
        throw new Error(LEDGER_ERROR_MESSAGES.INCONSISTENT_DEVICE_RESPONSE);
      }

      // Notify about success
      if (this.callbacks.onSigningStatusChange) {
        this.callbacks.onSigningStatusChange("success");
      }

      return {
        rawTransaction: bufferToHex(txBytes),
        signature: bufferToHex(fullSignature),
        // Public key can be fetched separately if needed
        publicKey: undefined,
      };
    } catch (error: unknown) {
      // Check if user rejected
      if (error && typeof error === "object" && "statusCode" in error) {
        const statusCode = (error as { statusCode: number }).statusCode;
        if (isUserRejection(statusCode)) {
          if (this.callbacks.onSigningStatusChange) {
            this.callbacks.onSigningStatusChange("rejected");
          }
          throw new Error(LEDGER_ERROR_MESSAGES.USER_REJECTED);
        }
      }

      // Notify about error
      if (this.callbacks.onSigningStatusChange) {
        this.callbacks.onSigningStatusChange("error");
      }

      // Transform error to readable message
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(LEDGER_ERROR_MESSAGES.SIGNING_FAILED);
    }
  }

  /**
   * Registers event callbacks.
   *
   * USE CASES:
   * Store or UI components can listen to state changes:
   * - onConnect: update UI after connection
   * - onDisconnect: clear state, show message to user
   * - onSigningStatusChange: update signing modal
   * - onError: display error
   *
   * @param callbacks - Object with callbacks
   */
  setCallbacks(callbacks: LedgerEventCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
}

export const ledgerService = new LedgerService();
