/**
 * Speculos Transport - Alternative transport for testing with Ledger Speculos emulator.
 *
 * WHY THIS FILE IS NEEDED:
 * ========================
 * The browser's WebHID API can ONLY communicate with real USB devices.
 * Speculos (Ledger's official emulator) doesn't emulate USB - it provides
 * a TCP/HTTP interface for APDU commands.
 *
 * This transport bridges that gap by implementing the same interface as
 * ledgerTransport.ts but communicating via HTTP instead of WebHID.
 *
 * COMMUNICATION ARCHITECTURE:
 * ===========================
 *
 * With REAL Ledger device:
 * ┌─────────────────┐     WebHID       
 * │  Browser        │ ◄──────────────► │  Ledger Device  │
 * │  (Extension)    │       USB        │  (Hardware)     │
 * └─────────────────┘                  └─────────────────┘
 *
 * With SPECULOS emulator:
 * ┌─────────────────┐      HTTP        ┌─────────────────┐
 * │  Browser        │ ◄──────────────► │  Speculos       │
 * │  (Extension)    │   localhost:5000 │  (Emulator)     │
 * │                 │                  │                 │
 * │ speculosTransport                  │  QRL Zond App   │
 * │      ↓          │                  │  (app.elf)      │
 * │  fetch() API    │                  └─────────────────┘
 * └─────────────────┘
 *
 * APDU FLOW:
 * ==========
 * 1. Extension calls speculosTransport.send(CLA, INS, P1, P2, data)
 * 2. Transport builds APDU packet: [CLA][INS][P1][P2][Lc][Data]
 * 3. Transport sends POST to http://localhost:5000/apdu with hex-encoded APDU
 * 4. Speculos executes the command on emulated Ledger app
 * 5. Speculos returns response as hex string
 * 6. Transport decodes response and returns to extension
 *
 * USAGE:
 * ======
 * 1. Start Speculos:
 *    speculos --model nanosp build/nanos2/bin/app.elf --api-port 5000 --display qt
 *
 * 2. Set environment variable: VITE_USE_SPECULOS=true
 *
 * 3. The ledgerTransport will automatically use speculosTransport
 */

import { LEDGER_ERROR_MESSAGES } from "@/constants/ledger";

// Speculos API endpoints.
// Override with VITE_SPECULOS_URL when the emulator runs on a remote host
// (e.g., `VITE_SPECULOS_URL=http://10.0.0.5:5000 VITE_USE_SPECULOS=true npm run dev`).
const SPECULOS_BASE_URL =
  import.meta.env.VITE_SPECULOS_URL ?? "http://localhost:5000";
const SPECULOS_APDU_ENDPOINT = `${SPECULOS_BASE_URL}/apdu`;
const SPECULOS_BUTTON_ENDPOINT = `${SPECULOS_BASE_URL}/button`;
const SPECULOS_EVENTS_ENDPOINT = `${SPECULOS_BASE_URL}/events`;

/**
 * Convert hex string to Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string.
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * SpeculosTransport - HTTP-based transport for Speculos emulator.
 *
 * Implements the same interface as LedgerTransportService but uses
 * HTTP fetch() instead of WebHID to communicate with Speculos.
 */
class SpeculosTransportService {
  private _isConnected: boolean = false;
  private disconnectCallback: (() => void) | null = null;

  /**
   * Check if Speculos transport is available.
   * Always returns true in browser environment since we use fetch API.
   */
  isSupported(): boolean {
    return typeof fetch !== "undefined";
  }

  /**
   * Check if currently connected to Speculos.
   */
  isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Connect to Speculos emulator.
   * Verifies that Speculos is running and responsive.
   */
  async connect(): Promise<void> {
    if (this._isConnected) {
      console.log("[SpeculosTransport] Already connected");
      return;
    }

    console.log("[SpeculosTransport] Connecting to Speculos...");

    try {
      // Test connection by checking events endpoint
      const response = await fetch(SPECULOS_EVENTS_ENDPOINT, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Speculos responded with status: ${response.status}`);
      }

      this._isConnected = true;
      console.log("[SpeculosTransport] Connected to Speculos emulator");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[SpeculosTransport] Connection failed:", message);
      throw new Error(
        `Failed to connect to Speculos at ${SPECULOS_BASE_URL}. ` +
          `Make sure Speculos is running with --api-port 5000. Error: ${message}`
      );
    }
  }

  /**
   * Disconnect from Speculos.
   */
  async disconnect(): Promise<void> {
    this._isConnected = false;
    console.log("[SpeculosTransport] Disconnected from Speculos");
  }

  /**
   * Send APDU command to Speculos and receive response.
   *
   * @param cla - Class byte (0xE0 for QRL Zond app)
   * @param ins - Instruction byte
   * @param p1 - Parameter 1
   * @param p2 - Parameter 2
   * @param data - Optional payload data
   * @returns Response data including status word
   */
  async send(
    cla: number,
    ins: number,
    p1: number,
    p2: number,
    data?: Uint8Array
  ): Promise<Uint8Array> {
    if (!this._isConnected) {
      throw new Error(LEDGER_ERROR_MESSAGES.NOT_CONNECTED);
    }

    // Build APDU packet: CLA INS P1 P2 [Lc] [Data]
    const payload = data || new Uint8Array(0);
    const apdu = new Uint8Array(5 + payload.length);
    apdu[0] = cla;
    apdu[1] = ins;
    apdu[2] = p1;
    apdu[3] = p2;
    apdu[4] = payload.length;
    if (payload.length > 0) {
      apdu.set(payload, 5);
    }

    const apduHex = bytesToHex(apdu);
    console.log(
      `[SpeculosTransport] >>> APDU: ${apduHex} (CLA=${cla.toString(16)} INS=${ins.toString(16)} P1=${p1} P2=${p2} Lc=${payload.length})`
    );

    try {
      const response = await fetch(SPECULOS_APDU_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: apduHex }),
      });

      if (!response.ok) {
        throw new Error(`Speculos API error: ${response.status}`);
      }

      const result = await response.json();
      const responseHex = result.data as string;

      console.log(`[SpeculosTransport] <<< Response: ${responseHex}`);

      return hexToBytes(responseHex);
    } catch (error) {
      console.error("[SpeculosTransport] Send failed:", error);

      // If network error, assume Speculos stopped
      if (error instanceof TypeError && error.message.includes("fetch")) {
        this._isConnected = false;
        if (this.disconnectCallback) {
          this.disconnectCallback();
        }
        throw new Error(LEDGER_ERROR_MESSAGES.DEVICE_DISCONNECTED);
      }

      throw error;
    }
  }

  /**
   * Register callback for disconnect events.
   */
  onDisconnect(callback: () => void): void {
    this.disconnectCallback = callback;
  }

  // ============================================
  // SPECULOS-SPECIFIC METHODS (for testing)
  // ============================================

  /**
   * Simulate button press on Speculos device.
   * Useful for automated testing to approve transactions.
   *
   * @param button - Which button to press: "left", "right", or "both"
   */
  async pressButton(button: "left" | "right" | "both"): Promise<void> {
    if (!this._isConnected) {
      throw new Error(LEDGER_ERROR_MESSAGES.NOT_CONNECTED);
    }

    try {
      await fetch(`${SPECULOS_BUTTON_ENDPOINT}/${button}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "press-and-release" }),
      });
      console.log(`[SpeculosTransport] Button pressed: ${button}`);
    } catch (error) {
      console.error("[SpeculosTransport] Button press failed:", error);
      throw error;
    }
  }

  /**
   * Navigate through Speculos screens by pressing right button.
   *
   * @param steps - Number of times to press right button
   * @param delayMs - Delay between presses in milliseconds
   */
  async navigateRight(steps: number, delayMs: number = 300): Promise<void> {
    for (let i = 0; i < steps; i++) {
      await this.pressButton("right");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  /**
   * Auto-approve a transaction by navigating through screens and confirming.
   * The number of screens depends on the transaction complexity.
   *
   * @param screens - Number of screens to navigate (default: 5)
   */
  async autoApprove(screens: number = 5): Promise<void> {
    console.log(
      `[SpeculosTransport] Auto-approving (${screens} screens + confirm)...`
    );
    await this.navigateRight(screens);
    await this.pressButton("both"); // Confirm with both buttons
    console.log("[SpeculosTransport] Auto-approve completed");
  }

  /**
   * Reject current operation by pressing left button.
   */
  async reject(): Promise<void> {
    console.log("[SpeculosTransport] Rejecting operation...");
    await this.pressButton("left");
  }

  /**
   * Get current screen text from Speculos (for debugging).
   */
  async getScreenText(): Promise<string[]> {
    try {
      const response = await fetch(`${SPECULOS_EVENTS_ENDPOINT}?stream=false`);
      const events = await response.json();
      // Extract text from events
      const texts: string[] = [];
      for (const event of events.events || []) {
        if (event.text) {
          texts.push(event.text);
        }
      }
      return texts;
    } catch (error) {
      console.error("[SpeculosTransport] Failed to get screen text:", error);
      return [];
    }
  }
}

// Export singleton instance
export const speculosTransport = new SpeculosTransportService();
export { SpeculosTransportService };
