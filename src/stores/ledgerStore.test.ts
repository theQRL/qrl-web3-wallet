import { describe, expect, it, vi, beforeEach } from "vitest";
import { LEDGER_ERROR_MESSAGES } from "@/constants/ledger";
import type { LedgerAccount, LedgerDeviceInfo } from "@/services/ledger/ledgerTypes";

describe("LedgerStore", () => {
  // Mock functions - using 'any' to avoid complex generic typing issues with Jest mocks
  // Transport mocks
  const mockConnect = vi.fn<any>();  // Used for both transport and service connect
  const mockDisconnect = vi.fn<any>();
  const mockIsConnected = vi.fn<any>();
  const mockOnDisconnect = vi.fn<any>();

  // Service mocks
  const mockGetAccounts = vi.fn<any>();
  const mockGetAddress = vi.fn<any>();
  const mockGetPublicKey = vi.fn<any>();
  const mockVerifyAddress = vi.fn<any>();
  const mockSignTransaction = vi.fn<any>();

  // Storage mocks
  const mockGetLedgerAccounts = vi.fn<any>();
  const mockSetLedgerAccounts = vi.fn<any>();
  const mockAddLedgerAccountToAllAccounts = vi.fn<any>();
  const mockRemoveLedgerAccountFromAllAccounts = vi.fn<any>();

  // FeeMarketEIP1559Transaction mocks
  const mockSerialize = vi.fn<any>();
  const mockRaw = vi.fn<any>();
  const mockGetMessageToSign = vi.fn<any>();
  const mockFromTxData = vi.fn<any>();
  const mockFromValuesArray = vi.fn<any>();

  // Store instance will be dynamically imported
  let LedgerStore: typeof import("./ledgerStore").default;
  let store: InstanceType<typeof LedgerStore>;

  const mockDeviceInfo: LedgerDeviceInfo = {
    model: "Ledger Nano S",
    version: "1.0.0",
    connected: true,
  };

  const mockAccounts: LedgerAccount[] = [
    {
      address: "Q00000000000000000000000000000000000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000",
      derivationPath: "m/44'/238'/0'/0'/0'",
      publicKey: "0xpublickey1",
      index: 0,
    },
    {
      address: "Q00000000000000000000000000000000000000000000000000000000098765432109876543210987654321098765432100000000000000000000000000000000",
      derivationPath: "m/44'/238'/0'/0'/1'",
      publicKey: "0xpublickey2",
      index: 1,
    },
  ];

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    vi.resetModules();

    // Default mock implementations
    mockGetLedgerAccounts.mockResolvedValue([]);
    mockSetLedgerAccounts.mockResolvedValue(undefined);
    mockAddLedgerAccountToAllAccounts.mockResolvedValue(undefined);
    mockRemoveLedgerAccountFromAllAccounts.mockResolvedValue(undefined);
    mockIsConnected.mockReturnValue(false);

    // Set up mocks using doMock (not hoisted)
    vi.doMock("@/services/ledger/ledgerTransport", () => ({
      ledgerTransport: {
        connect: mockConnect,
        disconnect: mockDisconnect,
        isConnected: mockIsConnected,
        onDisconnect: mockOnDisconnect,
      },
    }));

    vi.doMock("@/services/ledger/ledgerService", () => ({
      ledgerService: {
        connect: mockConnect,  // ledgerService.connect() returns LedgerDeviceInfo
        getAccounts: mockGetAccounts,
        getAddress: mockGetAddress,
        getPublicKey: mockGetPublicKey,
        verifyAddress: mockVerifyAddress,
        signTransaction: mockSignTransaction,
      },
    }));

    // Mock @theqrl/web3 for FeeMarketEIP1559Transaction
    mockSerialize.mockReturnValue(new Uint8Array([0x02, 0xab, 0xcd]));
    mockRaw.mockReturnValue([
      new Uint8Array([1]), // chainId
      new Uint8Array([0]), // nonce
      new Uint8Array([1]), // maxPriorityFeePerGas
      new Uint8Array([2]), // maxFeePerGas
      new Uint8Array([0x52, 0x08]), // gasLimit
      new Uint8Array([0xaa]), // to
      new Uint8Array([0x01]), // value
      new Uint8Array([]),   // data
      [],                   // accessList
      new Uint8Array([]),   // descriptor (empty for unsigned)
      new Uint8Array([]),   // extraParams (empty for unsigned)
      new Uint8Array([]),   // signature (empty for unsigned)
      new Uint8Array([]),   // publicKey (empty for unsigned)
    ]);
    mockGetMessageToSign.mockReturnValue(new Uint8Array([0x02, 0xf8, 0x50]));
    mockFromTxData.mockReturnValue({
      getMessageToSign: mockGetMessageToSign,
      raw: mockRaw,
      serialize: mockSerialize,
    });
    mockFromValuesArray.mockReturnValue({
      serialize: mockSerialize,
    });

    vi.doMock("@theqrl/web3-qrl-accounts", () => ({
      FeeMarketEIP1559Transaction: {
        fromTxData: mockFromTxData,
        fromValuesArray: mockFromValuesArray,
      },
    }));

    vi.doMock("@/utilities/storageUtil", () => ({
      __esModule: true,
      default: {
        getLedgerAccounts: mockGetLedgerAccounts,
        setLedgerAccounts: mockSetLedgerAccounts,
        addLedgerAccountToAllAccounts: mockAddLedgerAccountToAllAccounts,
        removeLedgerAccountFromAllAccounts: mockRemoveLedgerAccountFromAllAccounts,
      },
    }));

    // Dynamically import the store after mocks are set up
    const module = await import("./ledgerStore");
    LedgerStore = module.default;
    store = new LedgerStore();
  });

  describe("initial state", () => {
    it("should have disconnected connection state", () => {
      expect(store.connectionState).toBe("disconnected");
    });

    it("should have no device info", () => {
      expect(store.deviceInfo).toBeNull();
    });

    it("should have empty connection error", () => {
      expect(store.connectionError).toBe("");
    });

    it("should have empty accounts array", () => {
      expect(store.accounts).toEqual([]);
    });

    it("should have idle signing state", () => {
      expect(store.signingState).toBe("idle");
    });

    it("should not be loading accounts", () => {
      expect(store.isLoadingAccounts).toBe(false);
    });
  });

  describe("computed properties", () => {
    it("isConnected should return false when disconnected", () => {
      store.connectionState = "disconnected";
      expect(store.isConnected).toBe(false);
    });

    it("isConnected should return true when connected", () => {
      store.connectionState = "connected";
      expect(store.isConnected).toBe(true);
    });

    it("isConnecting should return true when connecting", () => {
      store.connectionState = "connecting";
      expect(store.isConnecting).toBe(true);
    });

    it("hasError should return true when in error state with message", () => {
      store.connectionState = "error";
      store.connectionError = "Test error";
      expect(store.hasError).toBe(true);
    });

    it("hasError should return false when error state but no message", () => {
      store.connectionState = "error";
      store.connectionError = "";
      expect(store.hasError).toBe(false);
    });

    it("hasAccounts should return true when accounts exist", () => {
      store.accounts = mockAccounts;
      expect(store.hasAccounts).toBe(true);
    });

    it("hasAccounts should return false when no accounts", () => {
      store.accounts = [];
      expect(store.hasAccounts).toBe(false);
    });

    it("isSigning should return true when signing", () => {
      store.signingState = "signing";
      expect(store.isSigning).toBe(true);
    });

    it("isSigning should return true when awaiting confirmation", () => {
      store.signingState = "awaiting_confirmation";
      expect(store.isSigning).toBe(true);
    });

    it("isSigning should return false when idle", () => {
      store.signingState = "idle";
      expect(store.isSigning).toBe(false);
    });

    it("isAwaitingConfirmation should return true when awaiting", () => {
      store.signingState = "awaiting_confirmation";
      expect(store.isAwaitingConfirmation).toBe(true);
    });
  });

  describe("connect", () => {
    it("should connect successfully", async () => {
      mockConnect.mockResolvedValue(undefined);
      mockConnect.mockResolvedValue(mockDeviceInfo);

      await store.connect();

      expect(mockConnect).toHaveBeenCalled();
      expect(mockConnect).toHaveBeenCalled();
      expect(store.connectionState).toBe("connected");
      expect(store.deviceInfo).toEqual(mockDeviceInfo);
      expect(store.connectionError).toBe("");
    });

    it("should set connecting state during connection", async () => {
      let resolveConnect: () => void;
      mockConnect.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveConnect = resolve;
        })
      );
      mockConnect.mockResolvedValue(mockDeviceInfo);

      const connectPromise = store.connect();
      expect(store.connectionState).toBe("connecting");

      resolveConnect!();
      await connectPromise;
    });

    it("should handle connection error", async () => {
      const errorMessage = "Connection failed";
      mockConnect.mockRejectedValue(new Error(errorMessage));

      await store.connect();

      expect(store.connectionState).toBe("error");
      expect(store.connectionError).toBe(errorMessage);
      expect(store.deviceInfo).toBeNull();
    });

    it("should not connect twice if already connecting", async () => {
      let resolveConnect: () => void;
      mockConnect.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveConnect = resolve;
        })
      );
      mockConnect.mockResolvedValue(mockDeviceInfo);

      const promise1 = store.connect();
      const promise2 = store.connect();

      resolveConnect!();
      await Promise.all([promise1, promise2]);

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });
  });

  describe("disconnect", () => {
    it("should disconnect successfully", async () => {
      mockDisconnect.mockResolvedValue(undefined);

      // First connect
      store.connectionState = "connected";
      store.deviceInfo = mockDeviceInfo;

      await store.disconnect();

      expect(mockDisconnect).toHaveBeenCalled();
      expect(store.connectionState).toBe("disconnected");
      expect(store.deviceInfo).toBeNull();
      expect(store.connectionError).toBe("");
    });

    it("should clear state even if disconnect throws", async () => {
      mockDisconnect.mockRejectedValue(new Error("Disconnect error"));

      store.connectionState = "connected";

      await store.disconnect();

      expect(store.connectionState).toBe("disconnected");
    });
  });

  describe("handleDeviceDisconnect", () => {
    it("should reset state when device disconnects", () => {
      // onDisconnect is called once per store construction in beforeEach,
      // but clearAllMocks resets call history. The last call is from current store.
      const lastCallIdx = mockOnDisconnect.mock.calls.length - 1;
      const disconnectCallback = mockOnDisconnect.mock.calls[lastCallIdx][0] as () => void;

      store.connectionState = "connected";
      store.deviceInfo = mockDeviceInfo;

      disconnectCallback();

      expect(store.connectionState).toBe("disconnected");
      expect(store.deviceInfo).toBeNull();
    });

    it("should set signing error if disconnected during signing", () => {
      const lastCallIdx = mockOnDisconnect.mock.calls.length - 1;
      const disconnectCallback = mockOnDisconnect.mock.calls[lastCallIdx][0] as () => void;

      store.connectionState = "connected";
      store.signingState = "signing";

      disconnectCallback();

      expect(store.connectionState).toBe("disconnected");
      expect(store.signingState).toBe("error");
      expect(store.signResult?.success).toBe(false);
    });
  });

  describe("clearError", () => {
    it("should clear connection error", () => {
      store.connectionState = "error";
      store.connectionError = "Some error";

      store.clearError();

      expect(store.connectionError).toBe("");
      expect(store.connectionState).toBe("disconnected");
    });

    it("should not change state if not in error state", () => {
      store.connectionState = "connected";
      store.connectionError = "";

      store.clearError();

      expect(store.connectionState).toBe("connected");
    });
  });

  describe("loadAccounts", () => {
    beforeEach(() => {
      store.connectionState = "connected";
    });

    it("should load accounts from device", async () => {
      mockGetAccounts.mockResolvedValue(mockAccounts);

      await store.loadAccounts(2, 0);

      expect(mockGetAccounts).toHaveBeenCalledWith(0, 2);
      expect(store.accounts).toEqual(mockAccounts);
      expect(mockSetLedgerAccounts).toHaveBeenCalledWith(mockAccounts);
    });

    it("should set loading state during fetch", async () => {
      let resolveGetAccounts: (accounts: LedgerAccount[]) => void;
      mockGetAccounts.mockReturnValue(
        new Promise((resolve) => {
          resolveGetAccounts = resolve;
        })
      );

      const loadPromise = store.loadAccounts();
      expect(store.isLoadingAccounts).toBe(true);

      resolveGetAccounts!(mockAccounts);
      await loadPromise;

      expect(store.isLoadingAccounts).toBe(false);
    });

    it("should throw if not connected", async () => {
      store.connectionState = "disconnected";

      await expect(store.loadAccounts()).rejects.toThrow(
        LEDGER_ERROR_MESSAGES.NOT_CONNECTED
      );
    });

    it("should clear loading state on error", async () => {
      mockGetAccounts.mockRejectedValue(new Error("Device error"));

      await expect(store.loadAccounts()).rejects.toThrow();

      expect(store.isLoadingAccounts).toBe(false);
    });
  });

  describe("fetchPageAccounts", () => {
    beforeEach(() => {
      store.connectionState = "connected";
    });

    it("should fetch accounts without writing to storage", async () => {
      mockGetAccounts.mockResolvedValue(mockAccounts);

      await store.fetchPageAccounts(2, 0);

      expect(mockGetAccounts).toHaveBeenCalledWith(0, 2);
      expect(store.accounts).toEqual(mockAccounts);
      expect(mockSetLedgerAccounts).not.toHaveBeenCalled();
    });

    it("should throw if not connected", async () => {
      store.connectionState = "disconnected";

      await expect(store.fetchPageAccounts()).rejects.toThrow(
        LEDGER_ERROR_MESSAGES.NOT_CONNECTED
      );
    });

    it("should set and clear loading state", async () => {
      let resolveGetAccounts: (accounts: LedgerAccount[]) => void;
      mockGetAccounts.mockReturnValue(
        new Promise((resolve) => {
          resolveGetAccounts = resolve;
        })
      );

      const fetchPromise = store.fetchPageAccounts();
      expect(store.isLoadingAccounts).toBe(true);

      resolveGetAccounts!(mockAccounts);
      await fetchPromise;

      expect(store.isLoadingAccounts).toBe(false);
    });

    it("should clear loading state on error", async () => {
      mockGetAccounts.mockRejectedValue(new Error("Device error"));

      await expect(store.fetchPageAccounts()).rejects.toThrow();

      expect(store.isLoadingAccounts).toBe(false);
    });
  });

  describe("addAccount", () => {
    beforeEach(() => {
      store.connectionState = "connected";
    });

    it("should add new account", async () => {
      const newAccount: LedgerAccount = mockAccounts[0];
      // verifyAddress returns just the address string, not an object
      mockVerifyAddress.mockResolvedValue(newAccount.address);
      mockGetPublicKey.mockResolvedValue({
        address: newAccount.address,
        publicKey: newAccount.publicKey,
      });

      const result = await store.addAccount(true);

      expect(result.address).toBe(newAccount.address);
      expect(store.accounts).toHaveLength(1);
      expect(mockSetLedgerAccounts).toHaveBeenCalled();
      expect(mockAddLedgerAccountToAllAccounts).toHaveBeenCalledWith(
        newAccount.address
      );
    });

    it("should throw if not connected", async () => {
      store.connectionState = "disconnected";

      await expect(store.addAccount()).rejects.toThrow(
        LEDGER_ERROR_MESSAGES.NOT_CONNECTED
      );
    });

    it("should increment account index after adding", async () => {
      // verifyAddress returns just the address string
      mockVerifyAddress.mockResolvedValue(mockAccounts[0].address);
      mockGetPublicKey.mockResolvedValue({
        address: mockAccounts[0].address,
        publicKey: mockAccounts[0].publicKey,
      });

      await store.addAccount();

      // Second call needs different address
      mockVerifyAddress.mockResolvedValue(mockAccounts[1].address);
      mockGetPublicKey.mockResolvedValue({
        address: mockAccounts[1].address,
        publicKey: mockAccounts[1].publicKey,
      });

      await store.addAccount();

      expect(store.accounts).toHaveLength(2);
      expect(store.accounts[1].index).toBe(1);
    });

    it("should use getAddress when verify is false", async () => {
      mockGetAddress.mockResolvedValue({
        address: mockAccounts[0].address,
        publicKey: "",
      });
      mockGetPublicKey.mockResolvedValue({
        address: mockAccounts[0].address,
        publicKey: mockAccounts[0].publicKey,
      });

      await store.addAccount(false);

      expect(mockGetAddress).toHaveBeenCalled();
      expect(mockVerifyAddress).not.toHaveBeenCalled();
    });

    it("should handle error during addAccount", async () => {
      mockVerifyAddress.mockRejectedValue(new Error("Device disconnected"));

      await expect(store.addAccount(true)).rejects.toThrow("Device disconnected");
      expect(store.isLoadingAccounts).toBe(false);
    });
  });

  describe("removeAccount", () => {
    beforeEach(() => {
      store.accounts = [...mockAccounts];
    });

    it("should remove account by address", async () => {
      await store.removeAccount(mockAccounts[0].address);

      expect(store.accounts).toHaveLength(1);
      expect(store.accounts[0].address).toBe(mockAccounts[1].address);
      expect(mockSetLedgerAccounts).toHaveBeenCalled();
      expect(mockRemoveLedgerAccountFromAllAccounts).toHaveBeenCalledWith(
        mockAccounts[0].address
      );
    });

    it("should handle case-insensitive address matching", async () => {
      await store.removeAccount(mockAccounts[0].address.toLowerCase());

      expect(store.accounts).toHaveLength(1);
    });
  });

  describe("verifyAddress", () => {
    beforeEach(() => {
      store.connectionState = "connected";
      store.accounts = [...mockAccounts];
    });

    it("should verify address on device", async () => {
      // verifyAddress returns just the address string
      mockVerifyAddress.mockResolvedValue(mockAccounts[0].address);

      const result = await store.verifyAddress(mockAccounts[0].address);

      expect(result).toBe(true);
      expect(mockVerifyAddress).toHaveBeenCalledWith(
        mockAccounts[0].derivationPath
      );
    });

    it("should return false if account not found", async () => {
      const result = await store.verifyAddress("Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000");

      expect(result).toBe(false);
      expect(mockVerifyAddress).not.toHaveBeenCalled();
    });

    it("should throw if not connected", async () => {
      store.connectionState = "disconnected";

      await expect(
        store.verifyAddress(mockAccounts[0].address)
      ).rejects.toThrow(LEDGER_ERROR_MESSAGES.NOT_CONNECTED);
    });

    it("should throw if device verification fails", async () => {
      mockVerifyAddress.mockRejectedValue(new Error("User rejected on device"));

      await expect(
        store.verifyAddress(mockAccounts[0].address)
      ).rejects.toThrow("User rejected on device");
    });
  });

  describe("getAccountByAddress", () => {
    beforeEach(() => {
      store.accounts = [...mockAccounts];
    });

    it("should find account by address", () => {
      const account = store.getAccountByAddress(mockAccounts[0].address);
      expect(account).toEqual(mockAccounts[0]);
    });

    it("should handle case-insensitive matching", () => {
      const account = store.getAccountByAddress(
        mockAccounts[0].address.toLowerCase()
      );
      expect(account).toEqual(mockAccounts[0]);
    });

    it("should return undefined if not found", () => {
      const account = store.getAccountByAddress("Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000");
      expect(account).toBeUndefined();
    });
  });

  describe("isLedgerAccount", () => {
    beforeEach(() => {
      store.accounts = [...mockAccounts];
    });

    it("should return true for ledger account", () => {
      expect(store.isLedgerAccount(mockAccounts[0].address)).toBe(true);
    });

    it("should return false for non-ledger account", () => {
      expect(store.isLedgerAccount("Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000")).toBe(false);
    });
  });

  describe("signTransaction", () => {
    beforeEach(() => {
      store.connectionState = "connected";
      store.accounts = [...mockAccounts];
    });

    // RLP-encoded transaction (hex string) - signTransaction expects this format
    const mockRlpEncodedTx = "0xf86c0185174876e800825208940000000000000000000000000000000000000001880de0b6b3a7640000801ca0...";

    it("should sign transaction successfully", async () => {
      const mockResponseFromLedger = {
        signature: "0xsignature",
        rawTransaction: "0xrawTransactionData"
      };

      mockSignTransaction.mockResolvedValue(mockResponseFromLedger);

      const result = await store.signTransaction(
        mockAccounts[0].address,
        mockRlpEncodedTx
      );

      expect(result.success).toBe(true);
      expect(result.signature).toBe(mockResponseFromLedger.signature);
      expect(result.rawTransaction).toBe(mockResponseFromLedger.rawTransaction);
      expect(store.signingState).toBe("completed");
    });

    it("should return error for non-ledger account", async () => {
      const result = await store.signTransaction(
        "Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        mockRlpEncodedTx
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not a Ledger account");
    });

    it("should set awaiting_confirmation state", async () => {
      let resolveSign: (sig: string) => void;
      mockSignTransaction.mockReturnValue(
        new Promise((resolve) => {
          resolveSign = resolve;
        })
      );

      const signPromise = store.signTransaction(
        mockAccounts[0].address,
        mockRlpEncodedTx
      );

      // Check intermediate states
      expect(store.isSigning).toBe(true);

      resolveSign!("0xsig");
      await signPromise;

      expect(store.signingState).toBe("completed");
    });

    it("should handle signing error", async () => {
      mockSignTransaction.mockRejectedValue(new Error("User rejected"));

      const result = await store.signTransaction(
        mockAccounts[0].address,
        mockRlpEncodedTx
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("User rejected");
      expect(store.signingState).toBe("error");
    });

    it("should try to connect if not connected", async () => {
      store.connectionState = "disconnected";
      mockConnect.mockResolvedValue(undefined);
      mockConnect.mockResolvedValue(mockDeviceInfo);
      mockSignTransaction.mockResolvedValue("0xsig");

      const result = await store.signTransaction(
        mockAccounts[0].address,
        mockRlpEncodedTx
      );

      expect(mockConnect).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should return error if auto-connect fails", async () => {
      store.connectionState = "disconnected";
      mockConnect.mockRejectedValue(new Error("Connection failed"));

      const result = await store.signTransaction(
        mockAccounts[0].address,
        mockRlpEncodedTx
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(LEDGER_ERROR_MESSAGES.NOT_CONNECTED);
    });
  });

  describe("clearSigningState", () => {
    it("should reset signing state to idle", () => {
      store.signingState = "completed";
      store.signingStatus = { state: "completed", message: "Done" };
      store.signResult = { success: true, signature: "0xsig" };

      store.clearSigningState();

      expect(store.signingState).toBe("idle");
      expect(store.signingStatus).toBeNull();
      expect(store.signResult).toBeNull();
    });
  });

  describe("loadAccountsFromStorage", () => {
    it("should load accounts from storage on initialization", async () => {
      // This test verifies the mock was called during store construction
      expect(mockGetLedgerAccounts).toHaveBeenCalled();
    });

    it("should restore nextAccountIndex from stored accounts", async () => {
      vi.clearAllMocks();
      vi.resetModules();

      const storedAccounts = [
        { address: "Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011100000000000000000000000000000000", derivationPath: "m/44'/238'/0'/0'/0'", publicKey: "", index: 0 },
        { address: "Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000022200000000000000000000000000000000", derivationPath: "m/44'/238'/0'/0'/3'", publicKey: "", index: 3 },
      ];
      mockGetLedgerAccounts.mockResolvedValue(storedAccounts);
      mockIsConnected.mockReturnValue(false);

      vi.doMock("@/services/ledger/ledgerTransport", () => ({
        ledgerTransport: {
          connect: mockConnect, disconnect: mockDisconnect,
          isConnected: mockIsConnected, onDisconnect: mockOnDisconnect,
        },
      }));
      vi.doMock("@/services/ledger/ledgerService", () => ({
        ledgerService: {
          connect: mockConnect, getAccounts: mockGetAccounts,
          getAddress: mockGetAddress, getPublicKey: mockGetPublicKey,
          verifyAddress: mockVerifyAddress, signTransaction: mockSignTransaction,
        },
      }));
      vi.doMock("@theqrl/web3", () => ({
        qrl: { accounts: {
          FeeMarketEIP1559Transaction: { fromTxData: mockFromTxData, fromValuesArray: mockFromValuesArray },
          Common: { custom: vi.fn().mockReturnValue({ chainId: 1 }) },
        }},
      }));
      vi.doMock("@/utilities/storageUtil", () => ({
        __esModule: true,
        default: {
          getLedgerAccounts: mockGetLedgerAccounts, setLedgerAccounts: mockSetLedgerAccounts,
          addLedgerAccountToAllAccounts: mockAddLedgerAccountToAllAccounts,
          removeLedgerAccountFromAllAccounts: mockRemoveLedgerAccountFromAllAccounts,
        },
      }));

      const module = await import("./ledgerStore");
      const freshStore = new module.default();

      // Wait for async loadAccountsFromStorage to complete
      await new Promise((r) => setTimeout(r, 50));

      expect(freshStore.accounts).toHaveLength(2);
      // nextAccountIndex is private, but we verify accounts were loaded with correct indices
      expect(freshStore.accounts[1].index).toBe(3);
    });

    it("should handle storage error gracefully", async () => {
      vi.clearAllMocks();
      vi.resetModules();

      mockGetLedgerAccounts.mockRejectedValue(new Error("Storage corrupted"));
      mockIsConnected.mockReturnValue(false);

      vi.doMock("@/services/ledger/ledgerTransport", () => ({
        ledgerTransport: {
          connect: mockConnect, disconnect: mockDisconnect,
          isConnected: mockIsConnected, onDisconnect: mockOnDisconnect,
        },
      }));
      vi.doMock("@/services/ledger/ledgerService", () => ({
        ledgerService: {
          connect: mockConnect, getAccounts: mockGetAccounts,
          getAddress: mockGetAddress, getPublicKey: mockGetPublicKey,
          verifyAddress: mockVerifyAddress, signTransaction: mockSignTransaction,
        },
      }));
      vi.doMock("@theqrl/web3", () => ({
        qrl: { accounts: {
          FeeMarketEIP1559Transaction: { fromTxData: mockFromTxData, fromValuesArray: mockFromValuesArray },
          Common: { custom: vi.fn().mockReturnValue({ chainId: 1 }) },
        }},
      }));
      vi.doMock("@/utilities/storageUtil", () => ({
        __esModule: true,
        default: {
          getLedgerAccounts: mockGetLedgerAccounts, setLedgerAccounts: mockSetLedgerAccounts,
          addLedgerAccountToAllAccounts: mockAddLedgerAccountToAllAccounts,
          removeLedgerAccountFromAllAccounts: mockRemoveLedgerAccountFromAllAccounts,
        },
      }));

      const module = await import("./ledgerStore");
      const freshStore = new module.default();

      // Wait for async loadAccountsFromStorage to complete
      await new Promise((r) => setTimeout(r, 50));

      // Should not crash - accounts remain empty
      expect(freshStore.accounts).toEqual([]);
    });
  });

  describe("fetchPublicKey", () => {
    beforeEach(() => {
      store.connectionState = "connected";
      store.accounts = [
        {
          address: "Q00000000000000000000000000000000000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000",
          derivationPath: "m/44'/238'/0'/0'/0'",
          publicKey: "",
          index: 0,
        },
      ];
    });

    it("should fetch public key and update account", async () => {
      const expectedPublicKey = "0xabc123publickey";
      mockGetPublicKey.mockResolvedValue({
        address: "Q00000000000000000000000000000000000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000",
        derivationPath: "m/44'/238'/0'/0'/0'",
        publicKey: expectedPublicKey,
      });

      const result = await store.fetchPublicKey("Q00000000000000000000000000000000000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000");

      expect(result.publicKey).toBe(expectedPublicKey);
      expect(mockGetPublicKey).toHaveBeenCalledWith("m/44'/238'/0'/0'/0'");
      expect(store.accounts[0].publicKey).toBe(expectedPublicKey);
      expect(mockSetLedgerAccounts).toHaveBeenCalled();
    });

    it("should throw if account not found", async () => {
      await expect(
        store.fetchPublicKey("Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000")
      ).rejects.toThrow("Account Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000 not found");
    });

    it("should auto-connect if not connected", async () => {
      store.connectionState = "disconnected";
      mockConnect.mockResolvedValue(mockDeviceInfo);
      mockGetPublicKey.mockResolvedValue({
        address: "Q00000000000000000000000000000000000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000",
        derivationPath: "m/44'/238'/0'/0'/0'",
        publicKey: "0xpk",
      });

      await store.fetchPublicKey("Q00000000000000000000000000000000000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000");

      expect(mockConnect).toHaveBeenCalled();
    });

    it("should handle case-insensitive address matching", async () => {
      mockGetPublicKey.mockResolvedValue({
        address: "Q00000000000000000000000000000000000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000",
        derivationPath: "m/44'/238'/0'/0'/0'",
        publicKey: "0xpk",
      });

      const result = await store.fetchPublicKey("q00000000000000000000000000000000000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000");

      expect(result.publicKey).toBe("0xpk");
      expect(store.accounts[0].publicKey).toBe("0xpk");
    });
  });

  describe("signAndSerializeTransaction", () => {
    const mockTxData = {
      nonce: "0x0",
      maxPriorityFeePerGas: "0x1",
      maxFeePerGas: "0x2",
      gasLimit: "0x5208",
      to: "Q00000000000000000000000000000000000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000",
      value: "0x1000",
      data: "0x",
    };
    const mockCommon = { chainId: 1 };

    beforeEach(() => {
      store.connectionState = "connected";
      store.accounts = [...mockAccounts];

      // signTransaction mock (ledgerService level)
      mockSignTransaction.mockResolvedValue({
        signature: "0xabcdef",
        rawTransaction: "0xrawtx",
      });
    });

    it("should sign and serialize transaction successfully", async () => {
      const result = await store.signAndSerializeTransaction(
        mockAccounts[0].address,
        mockTxData,
        mockCommon,
      );

      expect(mockFromTxData).toHaveBeenCalledWith(mockTxData, { common: mockCommon });
      expect(mockGetMessageToSign).toHaveBeenCalledWith(expect.any(Uint8Array), expect.any(Uint8Array), false);
      expect(mockRaw).toHaveBeenCalled();
      expect(mockFromValuesArray).toHaveBeenCalled();
      expect(mockSerialize).toHaveBeenCalled();
      expect(result).toMatch(/^0x/);
    });

    it("should use existing public key from account", async () => {
      await store.signAndSerializeTransaction(
        mockAccounts[0].address,
        mockTxData,
        mockCommon,
      );

      // Should NOT call fetchPublicKey/getPublicKey since account already has one
      expect(mockGetPublicKey).not.toHaveBeenCalled();
    });

    it("should fetch public key if not present on account", async () => {
      // Account without public key
      store.accounts = [{
        address: "Q00000000000000000000000000000000000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000",
        derivationPath: "m/44'/238'/0'/0'/0'",
        publicKey: "",
        index: 0,
      }];

      mockGetPublicKey.mockResolvedValue({
        address: "Q00000000000000000000000000000000000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000",
        derivationPath: "m/44'/238'/0'/0'/0'",
        publicKey: "0xfetchedpublickey",
      });

      await store.signAndSerializeTransaction(
        "Q00000000000000000000000000000000000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000",
        mockTxData,
        mockCommon,
      );

      expect(mockGetPublicKey).toHaveBeenCalledWith("m/44'/238'/0'/0'/0'");
    });

    it("should throw if signing fails", async () => {
      mockSignTransaction.mockRejectedValue(new Error("User rejected"));

      await expect(
        store.signAndSerializeTransaction(
          mockAccounts[0].address,
          mockTxData,
          mockCommon,
        )
      ).rejects.toThrow("User rejected");
    });

    it("should throw if account not found after signing", async () => {
      // Sign succeeds but then we remove accounts
      mockSignTransaction.mockImplementation(async () => {
        // Clear accounts to simulate race condition
        store.accounts = [];
        return { signature: "0xsig", rawTransaction: "0xraw" };
      });

      await expect(
        store.signAndSerializeTransaction(
          mockAccounts[0].address,
          mockTxData,
          mockCommon,
        )
      ).rejects.toThrow("Ledger account not found");
    });

    it("should throw if fetchPublicKey returns empty public key", async () => {
      store.accounts = [{
        address: "Q00000000000000000000000000000000000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000",
        derivationPath: "m/44'/238'/0'/0'/0'",
        publicKey: "",
        index: 0,
      }];

      mockGetPublicKey.mockResolvedValue({
        address: "Q00000000000000000000000000000000000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000",
        derivationPath: "m/44'/238'/0'/0'/0'",
        publicKey: "",
      });

      await expect(
        store.signAndSerializeTransaction(
          "Q00000000000000000000000000000000000000000000000000000000123456789012345678901234567890123456789000000000000000000000000000000000",
          mockTxData,
          mockCommon,
        )
      ).rejects.toThrow("Failed to fetch public key from Ledger");
    });

    it("should pass descriptor, extraParams, signature, and publicKey to fromValuesArray", async () => {
      await store.signAndSerializeTransaction(
        mockAccounts[0].address,
        mockTxData,
        mockCommon,
      );

      const callArgs = mockFromValuesArray.mock.calls[0];
      const valuesArray = callArgs[0] as any[];

      // Should have 13 elements:
      // 9 tx fields + descriptor + extraParams + signature + publicKey.
      expect(valuesArray).toHaveLength(13);
      expect(valuesArray[9]).toBeInstanceOf(Uint8Array);
      expect(valuesArray[9]).toHaveLength(3);
      expect(valuesArray[10]).toBeInstanceOf(Uint8Array);
      expect(valuesArray[10]).toHaveLength(0);
      expect(Buffer.isBuffer(valuesArray[11])).toBe(true); // signature
      expect(Buffer.isBuffer(valuesArray[12])).toBe(true); // publicKey
    });
  });
});
