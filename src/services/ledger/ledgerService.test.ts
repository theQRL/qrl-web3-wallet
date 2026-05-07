import { describe, expect, it, vi, beforeEach } from "vitest";
import { LEDGER_CONFIG, LEDGER_ERROR_MESSAGES } from "@/constants/ledger";

// Mock ledgerTransport
vi.mock("./ledgerTransport", () => ({
  ledgerTransport: {
    isSupported: vi.fn<any>(),
    isConnected: vi.fn<any>(),
    connect: vi.fn<any>(),
    disconnect: vi.fn<any>(),
    send: vi.fn<any>(),
    onDisconnect: vi.fn<any>(),
  },
}));

// Mock ledgerApdu functions
vi.mock("./ledgerApdu", () => ({
  packDerivationPath: vi.fn<any>(() => Buffer.alloc(21)),
  getDerivationPath: vi.fn<any>((index: number) => `m/44'/238'/0'/0/${index}`),
  splitIntoChunks: vi.fn<any>((data: Buffer) => [data]),
  combineSignatureChunks: vi.fn<any>((chunks: Buffer[]) => Buffer.concat(chunks)),
  parseQrlAddress: vi.fn<any>(() => "Q" + "ab".repeat(24)),
  parsePublicKeyResponse: vi.fn<any>(() => ({
    address: "Q" + "ab".repeat(24),
    publicKey: "0x" + "cc".repeat(100),
  })),
  parseAppVersion: vi.fn<any>(() => "1.2.3"),
  parseAppName: vi.fn<any>(() => "QRL Zond"),
  checkStatusWord: vi.fn<any>(),
  extractResponseData: vi.fn<any>((response: Buffer) =>
    response.subarray(0, response.length - 2)
  ),
  isUserRejection: vi.fn<any>((code: number) => code === 0x6985),
  isWrongApp: vi.fn<any>((code: number) => code === 0x6e00),
  hexToBuffer: vi.fn<any>((hex: string) =>
    Buffer.from(hex.replace(/^0x/, ""), "hex")
  ),
  bufferToHex: vi.fn<any>((buffer: Buffer) => "0x" + buffer.toString("hex")),
}));

// Note: We import modules dynamically in tests after applying mocks

describe("LedgerService", () => {
  // We'll use the singleton for testing
  let ledgerService: typeof import("./ledgerService").ledgerService;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Reset module to get fresh instance
    vi.resetModules();

    // Re-apply mocks after reset
    vi.doMock("./ledgerTransport", () => ({
      ledgerTransport: {
        isSupported: vi.fn<any>(),
        isConnected: vi.fn<any>(),
        connect: vi.fn<any>(),
        disconnect: vi.fn<any>(),
        send: vi.fn<any>(),
        onDisconnect: vi.fn<any>(),
      },
    }));

    vi.doMock("./ledgerApdu", () => ({
      packDerivationPath: vi.fn<any>(() => Buffer.alloc(21)),
      getDerivationPath: vi.fn<any>((index: number) => `m/44'/238'/0'/0/${index}`),
      splitIntoChunks: vi.fn<any>((data: Buffer) => [data]),
      combineSignatureChunks: vi.fn<any>((chunks: Buffer[]) =>
        Buffer.concat(chunks)
      ),
      parseQrlAddress: vi.fn<any>(() => "Q" + "ab".repeat(24)),
      parsePublicKeyResponse: vi.fn<any>(() => ({
        address: "Q" + "ab".repeat(24),
        publicKey: "0x" + "cc".repeat(100),
      })),
      parseAppVersion: vi.fn<any>(() => "1.2.3"),
      parseAppName: vi.fn<any>(() => "QRL Zond"),
      checkStatusWord: vi.fn<any>(),
      extractResponseData: vi.fn<any>((response: Buffer) =>
        response.subarray(0, response.length - 2)
      ),
      isUserRejection: vi.fn<any>((code: number) => code === 0x6985),
      isWrongApp: vi.fn<any>((code: number) => code === 0x6e00),
      hexToBuffer: vi.fn<any>((hex: string) =>
        Buffer.from(hex.replace(/^0x/, ""), "hex")
      ),
      bufferToHex: vi.fn<any>((buffer: Buffer) => "0x" + buffer.toString("hex")),
    }));

    // Import fresh instance
    const module = await import("./ledgerService");
    ledgerService = module.ledgerService;
  });

  describe("isSupported", () => {
    it("should return true when WebHID is supported", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.isSupported as any).mockReturnValue(true);

      expect(ledgerService.isSupported()).toBe(true);
    });

    it("should return false when WebHID is not supported", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.isSupported as any).mockReturnValue(false);

      expect(ledgerService.isSupported()).toBe(false);
    });
  });

  describe("isConnected", () => {
    it("should return true when connected", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.isConnected as any).mockReturnValue(true);

      expect(ledgerService.isConnected()).toBe(true);
    });

    it("should return false when not connected", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.isConnected as any).mockReturnValue(false);

      expect(ledgerService.isConnected()).toBe(false);
    });
  });

  describe("connect", () => {
    it("should connect and return device info on success", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.connect as any).mockResolvedValue(undefined);
      (transport.send as any).mockResolvedValue(
        Buffer.from([0x01, 0x02, 0x03, 0x90, 0x00])
      );

      const info = await ledgerService.connect();

      expect(transport.connect).toHaveBeenCalled();
      expect(transport.send).toHaveBeenCalledWith(
        LEDGER_CONFIG.CLA,
        LEDGER_CONFIG.INS.GET_VERSION,
        LEDGER_CONFIG.P1.START,
        LEDGER_CONFIG.P2.LAST
      );
      expect(info.version).toBe("1.2.3");
      expect(info.connected).toBe(true);
      expect(info.model).toBe("Ledger Nano");
    });

    it("should throw error when wrong app is open", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.connect as any).mockResolvedValue(undefined);
      (transport.send as any).mockRejectedValue({ statusCode: 0x6e00 });

      await expect(ledgerService.connect()).rejects.toThrow(
        LEDGER_ERROR_MESSAGES.APP_NOT_OPEN
      );
    });

    it("should throw connection error on failure", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.connect as any).mockRejectedValue(
        new Error("Connection failed")
      );

      await expect(ledgerService.connect()).rejects.toThrow();
    });

    it("should throw CONNECTION_FAILED for non-Error exceptions", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.connect as any).mockRejectedValue("some string error");

      await expect(ledgerService.connect()).rejects.toThrow(
        LEDGER_ERROR_MESSAGES.CONNECTION_FAILED
      );
    });
  });

  describe("getAppName", () => {
    it("should return app name", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.send as any).mockResolvedValue(
        Buffer.from([0x51, 0x52, 0x4c, 0x90, 0x00])
      );

      const name = await ledgerService.getAppName();

      expect(transport.send).toHaveBeenCalledWith(
        LEDGER_CONFIG.CLA,
        LEDGER_CONFIG.INS.GET_APP_NAME,
        LEDGER_CONFIG.P1.START,
        LEDGER_CONFIG.P2.LAST
      );
      expect(name).toBe("QRL Zond");
    });
  });

  describe("disconnect", () => {
    it("should call transport disconnect", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.disconnect as any).mockResolvedValue(undefined);

      await ledgerService.disconnect();

      expect(transport.disconnect).toHaveBeenCalled();
    });
  });

  describe("getAccounts", () => {
    it("should fetch multiple accounts with default parameters", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.send as any).mockResolvedValue(
        Buffer.concat([
          Buffer.from([0x51]), // 'Q' prefix
          Buffer.alloc(24, 0xab),
          Buffer.from([0x90, 0x00]),
        ])
      );

      const accounts = await ledgerService.getAccounts();

      expect(accounts.length).toBe(5);
      expect(transport.send).toHaveBeenCalledTimes(5);

      // Check indices
      accounts.forEach((account, i) => {
        expect(account.index).toBe(i);
        expect(account.derivationPath).toBe(`m/44'/238'/0'/0/${i}`);
      });
    });

    it("should fetch accounts with custom start index and count", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.send as any).mockResolvedValue(
        Buffer.concat([
          Buffer.from([0x51]),
          Buffer.alloc(24, 0xab),
          Buffer.from([0x90, 0x00]),
        ])
      );

      const accounts = await ledgerService.getAccounts(5, 3);

      expect(accounts.length).toBe(3);
      expect(accounts[0].index).toBe(5);
      expect(accounts[1].index).toBe(6);
      expect(accounts[2].index).toBe(7);
    });
  });

  describe("getAddress", () => {
    it("should fetch address without confirmation", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.send as any).mockResolvedValue(
        Buffer.concat([
          Buffer.from([0x51]),
          Buffer.alloc(24, 0xab),
          Buffer.from([0x90, 0x00]),
        ])
      );

      const result = await ledgerService.getAddress("m/44'/238'/0'/0/0", false);

      expect(transport.send).toHaveBeenCalledWith(
        LEDGER_CONFIG.CLA,
        LEDGER_CONFIG.INS.GET_PUBLIC_KEY,
        LEDGER_CONFIG.P1.START, // No confirmation
        LEDGER_CONFIG.P2.LAST,
        expect.any(Buffer)
      );
      expect(result.address).toMatch(/^Q/);
      expect(result.derivationPath).toBe("m/44'/238'/0'/0/0");
      expect(result.publicKey).toBe(""); // getAddress does not return public key
    });

    it("should fetch address with confirmation", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.send as any).mockResolvedValue(
        Buffer.concat([
          Buffer.from([0x51]),
          Buffer.alloc(24, 0xab),
          Buffer.from([0x90, 0x00]),
        ])
      );

      await ledgerService.getAddress("m/44'/238'/0'/0/0", true);

      expect(transport.send).toHaveBeenCalledWith(
        LEDGER_CONFIG.CLA,
        LEDGER_CONFIG.INS.GET_PUBLIC_KEY,
        LEDGER_CONFIG.P1.CONFIRM, // With confirmation
        LEDGER_CONFIG.P2.LAST,
        expect.any(Buffer)
      );
    });
  });

  describe("getPublicKey", () => {
    const STATUS_OK = Buffer.from([0x90, 0x00]);
    const ADDRESS_RESPONSE = Buffer.concat([
      Buffer.from([0x51]),
      Buffer.alloc(24, 0xab),
      STATUS_OK,
    ]);
    // Public-key reassembly is verified to be exactly 2592 bytes
    // (10 × 258-byte chunks + 1 × 12-byte chunk). Each mock call must
    // return a chunk of the size the chunk-index expects.
    const buildPubkeyChunkResponses = (): Buffer[] => {
      const chunks: Buffer[] = [];
      for (let i = 0; i < 10; i++) {
        chunks.push(Buffer.concat([Buffer.alloc(258, 0xcc), STATUS_OK]));
      }
      chunks.push(Buffer.concat([Buffer.alloc(12, 0xcc), STATUS_OK]));
      return chunks;
    };

    it("should fetch public key and address without confirmation", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      const responses = [ADDRESS_RESPONSE, ...buildPubkeyChunkResponses()];
      (transport.send as any).mockReset();
      for (const r of responses) {
        (transport.send as any).mockResolvedValueOnce(r);
      }

      const result = await ledgerService.getPublicKey(
        "m/44'/238'/0'/0/0",
        false
      );

      expect(transport.send).toHaveBeenNthCalledWith(
        1,
        LEDGER_CONFIG.CLA,
        LEDGER_CONFIG.INS.GET_PUBLIC_KEY,
        LEDGER_CONFIG.P1.START, // No confirmation
        LEDGER_CONFIG.P2.LAST,
        expect.any(Buffer)
      );
      expect(result.address).toMatch(/^Q/);
      expect(result.derivationPath).toBe("m/44'/238'/0'/0/0");
      expect(result.publicKey).toMatch(/^0x/); // getPublicKey returns public key
      expect(result.publicKey.length).toBeGreaterThan(2); // More than just "0x"
    });

    it("should fetch public key with confirmation", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      const responses = [ADDRESS_RESPONSE, ...buildPubkeyChunkResponses()];
      (transport.send as any).mockReset();
      for (const r of responses) {
        (transport.send as any).mockResolvedValueOnce(r);
      }

      await ledgerService.getPublicKey("m/44'/238'/0'/0/0", true);

      expect(transport.send).toHaveBeenNthCalledWith(
        1,
        LEDGER_CONFIG.CLA,
        LEDGER_CONFIG.INS.GET_PUBLIC_KEY,
        LEDGER_CONFIG.P1.CONFIRM, // With confirmation
        LEDGER_CONFIG.P2.LAST,
        expect.any(Buffer)
      );
    });
  });

  describe("verifyAddress", () => {
    it("should verify address with confirmation on device", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.send as any).mockResolvedValue(
        Buffer.concat([
          Buffer.from([0x51]),
          Buffer.alloc(24, 0xab),
          Buffer.from([0x90, 0x00]),
        ])
      );

      const address = await ledgerService.verifyAddress("m/44'/238'/0'/0/0");

      expect(transport.send).toHaveBeenCalledWith(
        LEDGER_CONFIG.CLA,
        LEDGER_CONFIG.INS.GET_PUBLIC_KEY,
        LEDGER_CONFIG.P1.CONFIRM,
        LEDGER_CONFIG.P2.LAST,
        expect.any(Buffer)
      );
      expect(address).toMatch(/^Q/);
    });
  });

  describe("signTransaction", () => {
    const mockTxHex = "0xaabbccdd";
    const mockDerivationPath = "m/44'/238'/0'/0/0";

    it("should sign transaction and return result", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      const signatureChunk = Buffer.concat([
        Buffer.alloc(100, 0xaa),
        Buffer.from([0x90, 0x00]),
      ]);
      (transport.send as any).mockResolvedValue(signatureChunk);

      const result = await ledgerService.signTransaction(
        mockDerivationPath,
        mockTxHex
      );

      expect(result).toHaveProperty("rawTransaction");
      expect(result).toHaveProperty("signature");
      expect(result.rawTransaction).toMatch(/^0x/);
      expect(result.signature).toMatch(/^0x/);
    });

    it("should send path in first phase", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      const signatureChunk = Buffer.concat([
        Buffer.alloc(100, 0xaa),
        Buffer.from([0x90, 0x00]),
      ]);
      (transport.send as any).mockResolvedValue(signatureChunk);

      await ledgerService.signTransaction(mockDerivationPath, mockTxHex);

      // First call should be path
      expect(transport.send).toHaveBeenNthCalledWith(
        1,
        LEDGER_CONFIG.CLA,
        LEDGER_CONFIG.INS.SIGN_TX,
        0x00, // P1: first packet (BIP32 path)
        0x00,
        expect.any(Buffer)
      );
    });

    it("should send last transaction chunk with P1=0x02", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      const signatureChunk = Buffer.concat([
        Buffer.alloc(100, 0xaa),
        Buffer.from([0x90, 0x00]),
      ]);
      (transport.send as any).mockResolvedValue(signatureChunk);

      await ledgerService.signTransaction(mockDerivationPath, mockTxHex);

      // Second call should be last TX chunk (since we have single chunk)
      expect(transport.send).toHaveBeenNthCalledWith(
        2,
        LEDGER_CONFIG.CLA,
        LEDGER_CONFIG.INS.SIGN_TX,
        0x02, // P1: last data packet
        0x00,
        expect.any(Buffer)
      );
    });

    it("should fetch all signature chunks", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      const signatureChunk = Buffer.concat([
        Buffer.alloc(100, 0xaa),
        Buffer.from([0x90, 0x00]),
      ]);
      (transport.send as any).mockResolvedValue(signatureChunk);

      await ledgerService.signTransaction(mockDerivationPath, mockTxHex);

      // 1 (path) + 1 (tx data) + 17 (remaining signature chunks) = 19 calls
      expect(transport.send).toHaveBeenCalledTimes(
        1 + 1 + (LEDGER_CONFIG.SIGNATURE_CHUNKS - 1)
      );
    });

    it("should handle user rejection", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");

      // First call succeeds, second fails with rejection
      (transport.send as any)
        .mockResolvedValueOnce(Buffer.from([0x90, 0x00])) // Path accepted
        .mockRejectedValueOnce({ statusCode: 0x6985 }); // User rejected

      await expect(
        ledgerService.signTransaction(mockDerivationPath, mockTxHex)
      ).rejects.toThrow(LEDGER_ERROR_MESSAGES.USER_REJECTED);
    });

    it("should handle signing error", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.send as any).mockRejectedValue(
        new Error("Signing failed")
      );

      await expect(
        ledgerService.signTransaction(mockDerivationPath, mockTxHex)
      ).rejects.toThrow();
    });

    it("should accept Buffer as transaction input", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      const signatureChunk = Buffer.concat([
        Buffer.alloc(100, 0xaa),
        Buffer.from([0x90, 0x00]),
      ]);
      (transport.send as any).mockResolvedValue(signatureChunk);

      const txBuffer = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]);

      await ledgerService.signTransaction(mockDerivationPath, txBuffer);

      expect(transport.send).toHaveBeenCalled();
    });

    it("should call signing status callbacks on success", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      const onSigningStatusChange = vi.fn<any>();
      ledgerService.setCallbacks({ onSigningStatusChange });

      const signatureChunk = Buffer.concat([
        Buffer.alloc(100, 0xaa),
        Buffer.from([0x90, 0x00]),
      ]);
      (transport.send as any).mockResolvedValue(signatureChunk);

      await ledgerService.signTransaction(mockDerivationPath, mockTxHex);

      expect(onSigningStatusChange).toHaveBeenCalledWith("connecting");
      expect(onSigningStatusChange).toHaveBeenCalledWith(
        "awaiting_confirmation"
      );
      expect(onSigningStatusChange).toHaveBeenCalledWith("success");
    });

    it("should send intermediate chunks with P1=0x01 for multi-chunk data", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      const { splitIntoChunks } = await import("./ledgerApdu");

      // Make splitIntoChunks return 3 chunks
      (splitIntoChunks as any).mockReturnValueOnce([
        Buffer.alloc(100, 0x01),
        Buffer.alloc(100, 0x02),
        Buffer.alloc(50, 0x03),
      ]);

      const signatureChunk = Buffer.concat([
        Buffer.alloc(100, 0xaa),
        Buffer.from([0x90, 0x00]),
      ]);
      (transport.send as any).mockResolvedValue(signatureChunk);

      await ledgerService.signTransaction(mockDerivationPath, mockTxHex);

      // Call 2: intermediate chunk 1 (P1=0x01)
      expect(transport.send).toHaveBeenNthCalledWith(
        2,
        LEDGER_CONFIG.CLA,
        LEDGER_CONFIG.INS.SIGN_TX,
        0x01,
        0x00,
        Buffer.alloc(100, 0x01)
      );
      // Call 3: intermediate chunk 2 (P1=0x01)
      expect(transport.send).toHaveBeenNthCalledWith(
        3,
        LEDGER_CONFIG.CLA,
        LEDGER_CONFIG.INS.SIGN_TX,
        0x01,
        0x00,
        Buffer.alloc(100, 0x02)
      );
    });

    it("should call rejected callback on user rejection", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      const onSigningStatusChange = vi.fn<any>();
      ledgerService.setCallbacks({ onSigningStatusChange });

      (transport.send as any)
        .mockResolvedValueOnce(Buffer.from([0x90, 0x00]))
        .mockRejectedValueOnce({ statusCode: 0x6985 });

      await expect(
        ledgerService.signTransaction(mockDerivationPath, mockTxHex)
      ).rejects.toThrow(LEDGER_ERROR_MESSAGES.USER_REJECTED);

      expect(onSigningStatusChange).toHaveBeenCalledWith("connecting");
      expect(onSigningStatusChange).toHaveBeenCalledWith("rejected");
    });

    it("should call error callback on non-rejection error with callbacks", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      const onSigningStatusChange = vi.fn<any>();
      ledgerService.setCallbacks({ onSigningStatusChange });

      (transport.send as any).mockRejectedValue(new Error("Signing failed"));

      await expect(
        ledgerService.signTransaction(mockDerivationPath, mockTxHex)
      ).rejects.toThrow("Signing failed");

      expect(onSigningStatusChange).toHaveBeenCalledWith("connecting");
      expect(onSigningStatusChange).toHaveBeenCalledWith("error");
    });

    it("should throw SIGNING_FAILED for non-Error exceptions", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");

      (transport.send as any).mockRejectedValue({ statusCode: 0x1234 });

      await expect(
        ledgerService.signTransaction(mockDerivationPath, mockTxHex)
      ).rejects.toThrow(LEDGER_ERROR_MESSAGES.SIGNING_FAILED);
    });
  });

  describe("setCallbacks", () => {
    it("should register callbacks", async () => {
      const onConnect = vi.fn<any>();

      ledgerService.setCallbacks({ onConnect });

      // Verify by triggering connect
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      (transport.connect as any).mockResolvedValue(undefined);
      (transport.send as any).mockResolvedValue(
        Buffer.from([0x01, 0x02, 0x03, 0x90, 0x00])
      );

      await ledgerService.connect();

      expect(onConnect).toHaveBeenCalled();
    });
  });

  describe("disconnect callback", () => {
    it("should call onDisconnect callback when device disconnects", async () => {
      const { ledgerTransport: transport } = await import("./ledgerTransport");
      const onDisconnect = vi.fn<any>();

      ledgerService.setCallbacks({ onDisconnect });

      // Get the handler registered in constructor
      const disconnectHandler = (transport.onDisconnect as any).mock
        .calls[0][0];

      // Simulate disconnect
      disconnectHandler();

      expect(onDisconnect).toHaveBeenCalled();
    });
  });

  describe("getConfig", () => {
    it("should return current configuration", () => {
      const config = ledgerService.getConfig();

      expect(config).toHaveProperty("connectionTimeout");
      expect(config).toHaveProperty("signingTimeout");
      expect(config.connectionTimeout).toBe(LEDGER_CONFIG.CONNECTION_TIMEOUT);
      expect(config.signingTimeout).toBe(LEDGER_CONFIG.SIGNING_TIMEOUT);
    });
  });
});
