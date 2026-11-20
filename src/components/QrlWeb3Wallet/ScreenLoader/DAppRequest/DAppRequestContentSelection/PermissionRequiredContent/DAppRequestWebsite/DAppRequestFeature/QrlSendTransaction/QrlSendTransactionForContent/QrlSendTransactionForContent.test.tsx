import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/UI/Tooltip";
import QrlSendTransactionForContent from "./QrlSendTransactionForContent";
import { SEND_TRANSACTION_TYPES } from "../QrlSendTransaction";
import Web3, { qrl } from "@theqrl/web3";
import { hexToBytes } from "@theqrl/web3-utils";
import { withCallDataAsData } from "@/scripts/utils/dappTransactionCallData";

vi.mock("@/functions/getHexSeedFromMnemonic", () => ({
  getHexSeedFromMnemonic: vi.fn(() => "0xhexseed"),
}));

vi.mock("@/scripts/utils/restrictedMethodsMiddlewareUtils", () => ({
  revalidateAuthorizedDAppRequest: vi.fn(async () => ({
    canProceed: true,
    proceedError: undefined,
  })),
}));

type MockPromiEvent = Promise<Record<string, unknown>> & {
  on: (event: string, cb: (...args: unknown[]) => void) => MockPromiEvent;
  once: (event: string, cb: (...args: unknown[]) => void) => MockPromiEvent;
};

function attachEmitter(
  promise: Promise<Record<string, unknown>>,
  hash?: unknown,
): MockPromiEvent {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const promiEvent = promise as MockPromiEvent;
  promiEvent.on = (event, cb) => {
    (listeners[event] ??= []).push(cb);
    // Emit on registration, not eagerly at construction time: the mock is
    // built once (at `vi.fn().mockReturnValue(...)` setup time), long
    // before the component calls sendSignedTransaction() and registers its
    // listener. Emitting on registration guarantees the listener is always
    // in place before the event fires, exactly like the real PromiEvent
    // (which only emits after its internal async work starts).
    if (event === "transactionHash" && hash !== undefined) {
      queueMicrotask(() => {
        cb(hash);
      });
    }
    return promiEvent;
  };
  promiEvent.once = promiEvent.on;
  return promiEvent;
}

/**
 * qrlInstance.sendSignedTransaction() returns a Web3PromiEvent: both a
 * thenable that resolves with the receipt and an event emitter that fires
 * "transactionHash" once the node has accepted the broadcast, well before
 * the receipt is available. The component now answers the dApp on that
 * event instead of on receipt, so the mocks below need to behave the same
 * way a real PromiEvent does.
 */
function createMockPromiEvent(receipt: Record<string, unknown>) {
  return attachEmitter(Promise.resolve(receipt), receipt.transactionHash);
}

/**
 * A PromiEvent that rejects without ever emitting "transactionHash", the
 * shape sendSignedTransaction() takes both when its own pre-broadcast
 * revert check (checkRevertBeforeSending) rejects a reverting call before
 * it is ever sent, and when the node rejects the raw transaction outright.
 */
function createMockRejectingPromiEvent(error: Error) {
  return attachEmitter(Promise.reject(error));
}

describe("QrlSendTransactionForContent", () => {
  afterEach(cleanup);

  let capturedPermissionCallback: ((hasApproved: boolean) => Promise<void>) | null = null;

  const renderComponent = (
    mockedStoreValues = mockedStore(),
    mockedProps: ComponentProps<typeof QrlSendTransactionForContent> = {
      transactionType: SEND_TRANSACTION_TYPES.UNKNOWN,
    },
  ) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <TooltipProvider>
            <QrlSendTransactionForContent {...mockedProps} />
          </TooltipProvider>
        </MemoryRouter>
      </StoreProvider>,
    );

  const zndTransferRequest = {
    from: "Q0000000000000000000000000000000000000000000000000000000020D20b8026B8F02540246f58120ddAAf35AECD9B00000000000000000000000000000000",
    to: "Q0000000000000000000000000000000000000000000000000000000020EE9760786AD48aB90E326c5cd78c6269Ba10AB00000000000000000000000000000000",
    value: "0x30",
    gas: "0x1cb55",
    type: "0x2",
  };

  const contractDeploymentRequest = {
    data: "0x608060405234",
    from: "Q0000000000000000000000000000000000000000000000000000000020D20b8026B8F02540246f58120ddAAf35AECD9B00000000000000000000000000000000",
    gas: "0x1cbb3",
    type: "0x2",
    value: "0x0",
  };

  const contractInteractionRequest = {
    from: "Q0000000000000000000000000000000000000000000000000000000020D20b8026B8F02540246f58120ddAAf35AECD9B00000000000000000000000000000000",
    to: "Q0000000000000000000000000000000000000000000000000000000020EE9760786AD48aB90E326c5cd78c6269Ba10AB00000000000000000000000000000000",
    data: "0x608060405234",
    value: "0x0",
    gas: "0x1cbb3",
    type: "0x2",
  };

  const createStoreWithCallback = (overrides: Record<string, any> = {}) => {
    capturedPermissionCallback = null;
    return mockedStore({
      qrlStore: {
        qrlConnection: { isConnected: true },
        qrlInstance: {
          getGasPrice: async () => BigInt(1000),
          getTransactionCount: async () => 0,
          getChainId: async () => 1,
          accounts: {
            signTransaction: async () => ({
              rawTransaction: "0xsignedraw",
            }),
          },
          sendSignedTransaction: vi.fn<any>().mockReturnValue(createMockPromiEvent({
            transactionHash: "0xtxhash",
          })),
        } as any,
        getGasFeeData: async () => ({
          baseFeePerGas: BigInt(100),
          maxFeePerGas: BigInt(200),
          maxPriorityFeePerGas: "100",
        }),
        ...overrides.qrlStore,
      },
      dAppRequestStore: {
        dAppRequestData: {
          params: [overrides.requestParams || zndTransferRequest],
        },
        setOnPermissionCallBack: (cb: any) => {
          capturedPermissionCallback = cb;
        },
        addToResponseData: overrides.addToResponseData || vi.fn(),
        ...overrides.dAppRequestStore,
      },
      lockStore: {
        getAccountSeed: async () => "0x010000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ...overrides.lockStore,
      },
      ledgerStore: {
        isLedgerAccount: () => false,
        signAndSerializeTransaction: async () => "0xledgersigned",
        ...overrides.ledgerStore,
      } as any,
      transactionHistoryStore: {
        ...overrides.transactionHistoryStore,
      } as any,
    });
  };

  it("should render the qrl send transaction component for contract deployment", async () => {
    const requestForContractDeployment = {
      data: "0x6080604052348015600e575f5ffd5b506101298061001c5f395ff3fe6080604052348015600e575f5ffd5b50600436106030575f3560e01c8063271f88b4146034578063d321fe2914604c575b5f5ffd5b604a60048036038101906046919060a9565b6066565b005b6052606f565b604051605d919060dc565b60405180910390f35b805f8190555050565b5f5f54905090565b5f5ffd5b5f819050919050565b608b81607b565b81146094575f5ffd5b50565b5f8135905060a3816084565b92915050565b5f6020828403121560bb5760ba6077565b5b5f60c6848285016097565b91505092915050565b60d681607b565b82525050565b5f60208201905060ed5f83018460cf565b9291505056fea26469706673582212203f5c1f328bda9fceed794ae68885d6664554bf4d7dbb1df839cc372d276837ab64736f6c634300081b0033",
      from: "Q0000000000000000000000000000000000000000000000000000000020D20b8026B8F02540246f58120ddAAf35AECD9B00000000000000000000000000000000",
      gas: "0x1cbb3",
      type: "0x2",
      value: "0x0",
    };
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: {
            params: [requestForContractDeployment],
          },
        },
      }),
      { transactionType: SEND_TRANSACTION_TYPES.CONTRACT_DEPLOYMENT },
    );

    const detailsTab = screen.getByRole("tab", { name: "Details" });
    const dataTab = screen.getByRole("tab", { name: "Data" });
    expect(detailsTab).toBeInTheDocument();
    expect(dataTab).toBeInTheDocument();
    expect(screen.getByText("From Address")).toBeInTheDocument();
    expect(
      screen.getByText("Q 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 020D2 0b802 6B8F0 25402 46f58 120dd AAf35 AECD9 B0000 00000 00000 00000 00000 00000 000"),
    ).toBeInTheDocument();
    expect(screen.getByText("Gas Limit")).toBeInTheDocument();
    expect(screen.getByText("117683")).toBeInTheDocument();
    await userEvent.click(dataTab);
    expect(
      screen.getByText(
        "0x6080604052348015600e575f5ffd5b506101298061001c5f395ff3fe6080604052348015600e575f5ffd5b50600436106030575f3560e01c8063271f88b4146034578063d321fe2914604c575b5f5ffd5b604a60048036038101906046919060a9565b6066565b005b6052606f565b604051605d919060dc565b60405180910390f35b805f8190555050565b5f5f54905090565b5f5ffd5b5f819050919050565b608b81607b565b81146094575f5ffd5b50565b5f8135905060a3816084565b92915050565b5f6020828403121560bb5760ba6077565b5b5f60c6848285016097565b91505092915050565b60d681607b565b82525050565b5f60208201905060ed5f83018460cf565b9291505056fea26469706673582212203f5c1f328bda9fceed794ae68885d6664554bf4d7dbb1df839cc372d276837ab64736f6c634300081b0033",
      ),
    ).toBeInTheDocument();
  });

  it("should render the qrl send transaction component for contract interaction", async () => {
    const requestForContractInteraction = {
      from: "Q0000000000000000000000000000000000000000000000000000000020D20b8026B8F02540246f58120ddAAf35AECD9B00000000000000000000000000000000",
      to: "Q0000000000000000000000000000000000000000000000000000000020EE9760786AD48aB90E326c5cd78c6269Ba10AB00000000000000000000000000000000",
      data: "0x6080604052348015600e575f5ffd5b506101298061001c5f395ff3fe6080604052348015600e575f5ffd5b50600436106030575f3560e01c8063271f88b4146034578063d321fe2914604c575b5f5ffd5b604a60048036038101906046919060a9565b6066565b005b6052606f565b604051605d919060dc565b60405180910390f35b805f8190555050565b5f5f54905090565b5f5ffd5b5f819050919050565b608b81607b565b81146094575f5ffd5b50565b5f8135905060a3816084565b92915050565b5f6020828403121560bb5760ba6077565b5b5f60c6848285016097565b91505092915050565b60d681607b565b82525050565b5f60208201905060ed5f83018460cf565b9291505056fea26469706673582212203f5c1f328bda9fceed794ae68885d6664554bf4d7dbb1df839cc372d276837ab64736f6c634300081b0033",
      value: "0x0",
      gas: "0x1cbb3",
      type: "0x2",
    };
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: {
            params: [requestForContractInteraction],
          },
        },
      }),
      { transactionType: SEND_TRANSACTION_TYPES.CONTRACT_INTERACTION },
    );

    const detailsTab = screen.getByRole("tab", { name: "Details" });
    const dataTab = screen.getByRole("tab", { name: "Data" });
    expect(detailsTab).toBeInTheDocument();
    expect(dataTab).toBeInTheDocument();
    expect(screen.getByText("From Address")).toBeInTheDocument();
    expect(
      screen.getByText("Q 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 020D2 0b802 6B8F0 25402 46f58 120dd AAf35 AECD9 B0000 00000 00000 00000 00000 00000 000"),
    ).toBeInTheDocument();
    expect(screen.getByText("Gas Limit")).toBeInTheDocument();
    expect(screen.getByText("117683")).toBeInTheDocument();
    await userEvent.click(dataTab);
    expect(
      screen.getByText(
        "0x6080604052348015600e575f5ffd5b506101298061001c5f395ff3fe6080604052348015600e575f5ffd5b50600436106030575f3560e01c8063271f88b4146034578063d321fe2914604c575b5f5ffd5b604a60048036038101906046919060a9565b6066565b005b6052606f565b604051605d919060dc565b60405180910390f35b805f8190555050565b5f5f54905090565b5f5ffd5b5f819050919050565b608b81607b565b81146094575f5ffd5b50565b5f8135905060a3816084565b92915050565b5f6020828403121560bb5760ba6077565b5b5f60c6848285016097565b91505092915050565b60d681607b565b82525050565b5f60208201905060ed5f83018460cf565b9291505056fea26469706673582212203f5c1f328bda9fceed794ae68885d6664554bf4d7dbb1df839cc372d276837ab64736f6c634300081b0033",
      ),
    ).toBeInTheDocument();
  });

  it("should render the Value row for contract interaction when value is non-zero", async () => {
    const requestForInteractionWithValue = {
      from: `Q${"ab".repeat(64)}`,
      to: `Q${"cd".repeat(64)}`,
      data: "0x608060405234",
      value: "0x30",
      gas: "0x1cbb3",
      type: "0x2",
    };
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: {
            params: [requestForInteractionWithValue],
          },
        },
      }),
      { transactionType: SEND_TRANSACTION_TYPES.CONTRACT_INTERACTION },
    );

    expect(screen.getByText("Value")).toBeInTheDocument();
    expect(screen.getByText("0.000000000000000048 QRL")).toBeInTheDocument();
  });

  it("should not render the Value row for contract interaction when value is zero", async () => {
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: {
            params: [contractInteractionRequest],
          },
        },
      }),
      { transactionType: SEND_TRANSACTION_TYPES.CONTRACT_INTERACTION },
    );

    expect(screen.queryByText("Value")).not.toBeInTheDocument();
  });

  it("should render the Value row for contract deployment when value is non-zero (payable constructor)", async () => {
    const requestForDeploymentWithValue = {
      ...contractDeploymentRequest,
      value: "0x30",
    };
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: {
            params: [requestForDeploymentWithValue],
          },
        },
      }),
      { transactionType: SEND_TRANSACTION_TYPES.CONTRACT_DEPLOYMENT },
    );

    expect(screen.getByText("Value")).toBeInTheDocument();
    expect(screen.getByText("0.000000000000000048 QRL")).toBeInTheDocument();
  });

  it("should sign contract interaction with the value shown in the UI", async () => {
    const mockSignTransaction = vi.fn<any>().mockResolvedValue({
      rawTransaction: "0xsignedinteract",
    });
    const mockSendSignedTransaction = vi.fn<any>().mockReturnValue(createMockPromiEvent({
      transactionHash: "0xinteracttxhash",
    }));
    const interactionWithValue = {
      ...contractInteractionRequest,
      value: "0x30",
    };

    renderComponent(
      createStoreWithCallback({
        requestParams: interactionWithValue,
        qrlStore: {
          qrlInstance: {
            getGasPrice: async () => BigInt(1000),
            getTransactionCount: async () => 0,
            getChainId: async () => 1,
            accounts: {
              signTransaction: mockSignTransaction,
            },
            sendSignedTransaction: mockSendSignedTransaction,
          } as any,
        },
      }),
      { transactionType: SEND_TRANSACTION_TYPES.CONTRACT_INTERACTION },
    );

    // UI must show the value that will be signed.
    expect(screen.getByText("Value")).toBeInTheDocument();
    expect(screen.getByText("0.000000000000000048 QRL")).toBeInTheDocument();

    await act(async () => {
      await capturedPermissionCallback!(true);
    });

    // And the signed transaction must carry that same value.
    const signedTx = mockSignTransaction.mock.calls[0][0] as Record<string, unknown>;
    expect(signedTx.value).toBe("0x30");
  });

  it("should render the qrl send transaction component for QRL transfer", async () => {
    const requestForZndTransfer = {
      from: "Q0000000000000000000000000000000000000000000000000000000020D20b8026B8F02540246f58120ddAAf35AECD9B00000000000000000000000000000000",
      to: "Q0000000000000000000000000000000000000000000000000000000020EE9760786AD48aB90E326c5cd78c6269Ba10AB00000000000000000000000000000000",
      value: "0x30",
      gas: "0x1cb55",
      type: "0x2",
    };
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: {
            params: [requestForZndTransfer],
          },
        },
      }),
      { transactionType: SEND_TRANSACTION_TYPES.QRL_TRANSFER },
    );

    const detailsTab = screen.getByRole("tab", { name: "Details" });
    const dataTab = screen.queryByRole("tab", { name: "Data" });
    expect(detailsTab).toBeInTheDocument();
    expect(dataTab).not.toBeInTheDocument();
    expect(screen.getByText("From Address")).toBeInTheDocument();
    expect(
      screen.getByText("Q 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 020D2 0b802 6B8F0 25402 46f58 120dd AAf35 AECD9 B0000 00000 00000 00000 00000 00000 000"),
    ).toBeInTheDocument();
    expect(screen.getByText("To Address")).toBeInTheDocument();
    expect(
      screen.getByText("Q 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 020EE 97607 86AD4 8aB90 E326c 5cd78 c6269 Ba10A B0000 00000 00000 00000 00000 00000 000"),
    ).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
    expect(screen.getByText("0.000000000000000048 QRL")).toBeInTheDocument();
    expect(screen.getByText("Gas Limit")).toBeInTheDocument();
    expect(screen.getByText("117589")).toBeInTheDocument();
  });

  describe("sendZndTransfer", () => {
    it("should send QRL transfer via regular account (mnemonic)", async () => {
      const mockSendSignedTransaction = vi.fn<any>().mockReturnValue(createMockPromiEvent({
        transactionHash: "0xtxhash",
      }));
      const mockAddToResponseData = vi.fn();

      renderComponent(
        createStoreWithCallback({
          qrlStore: {
            qrlInstance: {
              getGasPrice: async () => BigInt(1000),
              getTransactionCount: async () => 0,
              getChainId: async () => 1,
              accounts: {
                signTransaction: async () => ({
                  rawTransaction: "0xsignedraw",
                }),
              },
              sendSignedTransaction: mockSendSignedTransaction,
            } as any,
          },
          addToResponseData: mockAddToResponseData,
        }),
        { transactionType: SEND_TRANSACTION_TYPES.QRL_TRANSFER },
      );

      expect(capturedPermissionCallback).not.toBeNull();
      await act(async () => {
        await capturedPermissionCallback!(true);
      });

      expect(mockSendSignedTransaction).toHaveBeenCalledWith("0xsignedraw");
      expect(mockAddToResponseData).toHaveBeenCalledWith({
        transactionHash: "0xtxhash",
      });
    });

    it("should send QRL transfer via Ledger account", async () => {
      const mockSendSignedTransaction = vi.fn<any>().mockReturnValue(createMockPromiEvent({
        transactionHash: "0xledgertxhash",
      }));
      const mockAddToResponseData = vi.fn();
      const mockSignAndSerialize = vi.fn<any>().mockResolvedValue("0xledgersigned");

      renderComponent(
        createStoreWithCallback({
          qrlStore: {
            qrlInstance: {
              getGasPrice: async () => BigInt(1000),
              getTransactionCount: async () => 0,
              getChainId: async () => 1,
              sendSignedTransaction: mockSendSignedTransaction,
            } as any,
          },
          addToResponseData: mockAddToResponseData,
          ledgerStore: {
            isLedgerAccount: () => true,
            signAndSerializeTransaction: mockSignAndSerialize,
          },
        }),
        { transactionType: SEND_TRANSACTION_TYPES.QRL_TRANSFER },
      );

      await act(async () => {
        await capturedPermissionCallback!(true);
      });

      expect(mockSignAndSerialize).toHaveBeenCalled();
      expect(mockSendSignedTransaction).toHaveBeenCalledWith("0xledgersigned");
      expect(mockAddToResponseData).toHaveBeenCalledWith({
        transactionHash: "0xledgertxhash",
      });
    });

    it.each([
      ["names no type", { type: undefined }],
      ["names type 0x02", { type: "0x02" }],
      ["carries a gas price", { type: undefined, gasPrice: "0x3b9aca00" }],
    ])(
      "should sign a QRL transfer as type 0x2 when the request %s",
      async (_label, fields) => {
        const mockSignTransaction = vi.fn<any>().mockResolvedValue({
          rawTransaction: "0xsignedtransfer",
        });
        const mockSendSignedTransaction = vi.fn<any>().mockReturnValue(createMockPromiEvent({
          transactionHash: "0xtxhash",
        }));
        const mockAddToResponseData = vi.fn();

        renderComponent(
          createStoreWithCallback({
            requestParams: { ...zndTransferRequest, ...fields },
            qrlStore: {
              qrlInstance: {
                getTransactionCount: async () => 0,
                accounts: { signTransaction: mockSignTransaction },
                sendSignedTransaction: mockSendSignedTransaction,
              } as any,
            },
            addToResponseData: mockAddToResponseData,
          }),
          { transactionType: SEND_TRANSACTION_TYPES.QRL_TRANSFER },
        );

        await act(async () => {
          await capturedPermissionCallback!(true);
        });

        const signedTx = mockSignTransaction.mock.calls[0][0] as Record<string, unknown>;
        expect(signedTx).toMatchObject({
          type: "0x2",
          maxFeePerGas: "0xc8",
          maxPriorityFeePerGas: "100",
        });
        expect(signedTx).not.toHaveProperty("gasPrice");
        expect(mockSendSignedTransaction).toHaveBeenCalledWith("0xsignedtransfer");
        expect(mockAddToResponseData).toHaveBeenCalledWith({
          transactionHash: "0xtxhash",
        });
      },
    );

    it("should handle error when from is missing", async () => {
      const mockAddToResponseData = vi.fn();
      const missingFromRequest = { ...zndTransferRequest, from: "" };

      renderComponent(
        createStoreWithCallback({
          requestParams: missingFromRequest,
          addToResponseData: mockAddToResponseData,
        }),
        { transactionType: SEND_TRANSACTION_TYPES.QRL_TRANSFER },
      );

      await act(async () => {
        await capturedPermissionCallback!(true);
      });

      expect(mockAddToResponseData).toHaveBeenCalledWith({
        error: expect.objectContaining({
          message: expect.stringContaining("from"),
        }),
      });
    });

    it("should handle error when Ledger signing fails", async () => {
      const mockAddToResponseData = vi.fn();

      renderComponent(
        createStoreWithCallback({
          addToResponseData: mockAddToResponseData,
          ledgerStore: {
            isLedgerAccount: () => true,
            signAndSerializeTransaction: async () => {
              throw new Error("User rejected on device");
            },
          },
          qrlStore: {
            qrlInstance: {
              getGasPrice: async () => BigInt(1000),
              getTransactionCount: async () => 0,
              getChainId: async () => 1,
            } as any,
          },
        }),
        { transactionType: SEND_TRANSACTION_TYPES.QRL_TRANSFER },
      );

      await act(async () => {
        await capturedPermissionCallback!(true);
      });

      expect(mockAddToResponseData).toHaveBeenCalledWith({
        error: expect.objectContaining({
          message: "User rejected on device",
        }),
      });
    });
  });

  describe("broadcastAndRespond (dApp answered on broadcast, not on mining)", () => {
    it("should answer the dApp with the hash, and record a pending history entry, before the receipt resolves", async () => {
      // A PromiEvent whose receipt never resolves during this test: it
      // emits "transactionHash" but its own promise stays pending, standing
      // in for the real library's wait for the block that mines the
      // transaction.
      const receiptPromise = new Promise<Record<string, unknown>>(() => {
        /* never resolves within this test */
      });
      const mockSendSignedTransaction = vi
        .fn<any>()
        .mockImplementation(() =>
          attachEmitter(receiptPromise, "0xpendingtxhash"),
        );
      const mockAddToResponseData = vi.fn();
      const mockAddTransaction = vi.fn(async () => {});
      const mockUpdateTransaction = vi.fn(async () => {});

      renderComponent(
        createStoreWithCallback({
          qrlStore: {
            qrlInstance: {
              getGasPrice: async () => BigInt(1000),
              getTransactionCount: async () => 0,
              getChainId: async () => 1,
              accounts: {
                signTransaction: async () => ({
                  rawTransaction: "0xsignedraw",
                }),
              },
              sendSignedTransaction: mockSendSignedTransaction,
            } as any,
          },
          addToResponseData: mockAddToResponseData,
          transactionHistoryStore: {
            addTransaction: mockAddTransaction,
            updateTransaction: mockUpdateTransaction,
          },
        }),
        { transactionType: SEND_TRANSACTION_TYPES.QRL_TRANSFER },
      );

      await act(async () => {
        await capturedPermissionCallback!(true);
      });

      // The dApp already has its answer, and a pending entry is on record,
      // even though the receipt promise above is still unsettled.
      expect(mockAddToResponseData).toHaveBeenCalledWith({
        transactionHash: "0xpendingtxhash",
      });
      expect(mockAddTransaction).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          transactionHash: "0xpendingtxhash",
          pendingStatus: "pending",
        }),
      );
      expect(mockUpdateTransaction).not.toHaveBeenCalled();
    });

    it("should never answer the dApp with a hash when the transaction fails before broadcast (reverts) or the node rejects it", async () => {
      // qrlInstance.sendSignedTransaction() runs its own pre-broadcast
      // revert check by default (checkRevertBeforeSending) and rejects
      // without ever emitting "transactionHash" when it reverts; a node
      // rejecting the raw transaction outright behaves the same way from
      // this component's point of view. Either way, no hash exists to give
      // the dApp.
      const mockSendSignedTransaction = vi
        .fn<any>()
        .mockImplementation(() =>
          createMockRejectingPromiEvent(new Error("execution reverted")),
        );
      const mockAddToResponseData = vi.fn();

      renderComponent(
        createStoreWithCallback({
          qrlStore: {
            qrlInstance: {
              getGasPrice: async () => BigInt(1000),
              getTransactionCount: async () => 0,
              getChainId: async () => 1,
              accounts: {
                signTransaction: async () => ({
                  rawTransaction: "0xsignedraw",
                }),
              },
              sendSignedTransaction: mockSendSignedTransaction,
            } as any,
          },
          addToResponseData: mockAddToResponseData,
        }),
        { transactionType: SEND_TRANSACTION_TYPES.QRL_TRANSFER },
      );

      await act(async () => {
        await capturedPermissionCallback!(true);
      });

      expect(mockAddToResponseData).not.toHaveBeenCalledWith(
        expect.objectContaining({ transactionHash: expect.anything() }),
      );
      expect(mockAddToResponseData).toHaveBeenCalledWith({
        error: expect.objectContaining({ message: "execution reverted" }),
      });
    });

    it("should update the pending history entry once the receipt resolves, while still open", async () => {
      let resolveReceipt!: (receipt: Record<string, unknown>) => void;
      const receiptPromise = new Promise<Record<string, unknown>>(
        (resolve) => {
          resolveReceipt = resolve;
        },
      );
      const mockSendSignedTransaction = vi
        .fn<any>()
        .mockImplementation(() =>
          attachEmitter(receiptPromise, "0xminedtxhash"),
        );
      const mockAddTransaction = vi.fn(async () => {});
      const mockUpdateTransaction = vi.fn(async () => {});

      renderComponent(
        createStoreWithCallback({
          qrlStore: {
            qrlInstance: {
              getGasPrice: async () => BigInt(1000),
              getTransactionCount: async () => 0,
              getChainId: async () => 1,
              accounts: {
                signTransaction: async () => ({
                  rawTransaction: "0xsignedraw",
                }),
              },
              sendSignedTransaction: mockSendSignedTransaction,
            } as any,
          },
          transactionHistoryStore: {
            addTransaction: mockAddTransaction,
            updateTransaction: mockUpdateTransaction,
          },
        }),
        { transactionType: SEND_TRANSACTION_TYPES.QRL_TRANSFER },
      );

      await act(async () => {
        await capturedPermissionCallback!(true);
      });
      expect(mockUpdateTransaction).not.toHaveBeenCalled();

      await act(async () => {
        resolveReceipt({
          transactionHash: "0xminedtxhash",
          status: BigInt(1),
          blockNumber: BigInt(1),
          gasUsed: BigInt(21000),
          effectiveGasPrice: BigInt(1),
        });
        await receiptPromise;
      });

      expect(mockUpdateTransaction).toHaveBeenCalledWith(
        expect.any(String),
        "0xminedtxhash",
        expect.objectContaining({ pendingStatus: "confirmed", status: true }),
      );
    });
  });

  describe("deployContractOrInteract", () => {
    it("should deploy contract via regular account (mnemonic)", async () => {
      const mockSendSignedTransaction = vi.fn<any>().mockReturnValue(createMockPromiEvent({
        transactionHash: "0xdeploytxhash",
      }));
      const mockAddToResponseData = vi.fn();

      renderComponent(
        createStoreWithCallback({
          requestParams: contractDeploymentRequest,
          qrlStore: {
            qrlInstance: {
              getGasPrice: async () => BigInt(1000),
              getTransactionCount: async () => 0,
              getChainId: async () => 1,
              accounts: {
                signTransaction: async () => ({
                  rawTransaction: "0xsigneddeploy",
                }),
              },
              sendSignedTransaction: mockSendSignedTransaction,
            } as any,
          },
          addToResponseData: mockAddToResponseData,
        }),
        { transactionType: SEND_TRANSACTION_TYPES.CONTRACT_DEPLOYMENT },
      );

      await act(async () => {
        await capturedPermissionCallback!(true);
      });

      expect(mockSendSignedTransaction).toHaveBeenCalledWith("0xsigneddeploy");
      expect(mockAddToResponseData).toHaveBeenCalledWith({
        transactionHash: "0xdeploytxhash",
      });
    });

    it("should deploy contract via Ledger account", async () => {
      const mockSendSignedTransaction = vi.fn<any>().mockReturnValue(createMockPromiEvent({
        transactionHash: "0xledgerdeployhash",
      }));
      const mockAddToResponseData = vi.fn();
      const mockSignAndSerialize = vi.fn<any>().mockResolvedValue("0xledgerdeploy");

      renderComponent(
        createStoreWithCallback({
          requestParams: contractDeploymentRequest,
          qrlStore: {
            qrlInstance: {
              getGasPrice: async () => BigInt(1000),
              getTransactionCount: async () => 0,
              getChainId: async () => 1,
              sendSignedTransaction: mockSendSignedTransaction,
            } as any,
          },
          addToResponseData: mockAddToResponseData,
          ledgerStore: {
            isLedgerAccount: () => true,
            signAndSerializeTransaction: mockSignAndSerialize,
          },
        }),
        { transactionType: SEND_TRANSACTION_TYPES.CONTRACT_DEPLOYMENT },
      );

      await act(async () => {
        await capturedPermissionCallback!(true);
      });

      expect(mockSignAndSerialize).toHaveBeenCalled();
      expect(mockSendSignedTransaction).toHaveBeenCalledWith("0xledgerdeploy");
      expect(mockAddToResponseData).toHaveBeenCalledWith({
        transactionHash: "0xledgerdeployhash",
      });
    });

    it("should interact with contract via Ledger account (with to address)", async () => {
      const mockSendSignedTransaction = vi.fn<any>().mockReturnValue(createMockPromiEvent({
        transactionHash: "0xledgerinteracthash",
      }));
      const mockAddToResponseData = vi.fn();
      const mockSignAndSerialize = vi.fn<any>().mockResolvedValue("0xledgerinteract");

      renderComponent(
        createStoreWithCallback({
          requestParams: contractInteractionRequest,
          qrlStore: {
            qrlInstance: {
              getGasPrice: async () => BigInt(1000),
              getTransactionCount: async () => 0,
              getChainId: async () => 1,
              sendSignedTransaction: mockSendSignedTransaction,
            } as any,
          },
          addToResponseData: mockAddToResponseData,
          ledgerStore: {
            isLedgerAccount: () => true,
            signAndSerializeTransaction: mockSignAndSerialize,
          },
        }),
        { transactionType: SEND_TRANSACTION_TYPES.CONTRACT_INTERACTION },
      );

      await act(async () => {
        await capturedPermissionCallback!(true);
      });

      // Verify txData includes 'to' for contract interaction
      const txDataArg = mockSignAndSerialize.mock.calls[0][1] as Record<string, any>;
      expect(txDataArg.to).toBe(contractInteractionRequest.to);
      expect(mockSendSignedTransaction).toHaveBeenCalledWith("0xledgerinteract");
    });

    it.each([
      ["names no type", { type: undefined }],
      ["carries a gas price", { type: undefined, gasPrice: "0x3b9aca00" }],
    ])(
      "should give a Ledger account type 0x2 fee fields when a deployment request %s",
      async (_label, fields) => {
        const mockSendSignedTransaction = vi.fn<any>().mockReturnValue(createMockPromiEvent({
          transactionHash: "0xhash",
        }));
        const mockSignAndSerialize = vi.fn<any>().mockResolvedValue("0xsigned");

        renderComponent(
          createStoreWithCallback({
            requestParams: { ...contractDeploymentRequest, ...fields },
            qrlStore: {
              qrlInstance: {
                getTransactionCount: async () => 0,
                getChainId: async () => 1,
                sendSignedTransaction: mockSendSignedTransaction,
              } as any,
            },
            ledgerStore: {
              isLedgerAccount: () => true,
              signAndSerializeTransaction: mockSignAndSerialize,
            },
          }),
          { transactionType: SEND_TRANSACTION_TYPES.CONTRACT_DEPLOYMENT },
        );

        await act(async () => {
          await capturedPermissionCallback!(true);
        });

        const txDataArg = mockSignAndSerialize.mock.calls[0][1] as Record<string, any>;
        expect(txDataArg).toMatchObject({
          maxFeePerGas: "0xc8",
          maxPriorityFeePerGas: "100",
        });
        expect(txDataArg).not.toHaveProperty("gasPrice");
        expect(mockSendSignedTransaction).toHaveBeenCalledWith("0xsigned");
      },
    );

    it.each([
      ["names no type", { type: undefined }],
      ["names type 0x02", { type: "0x02" }],
      ["carries a gas price", { type: undefined, gasPrice: "0x3b9aca00" }],
    ])(
      "should sign a contract interaction as type 0x2 when the request %s",
      async (_label, fields) => {
        const mockSignTransaction = vi.fn<any>().mockResolvedValue({
          rawTransaction: "0xsignedinteract",
        });
        const mockSendSignedTransaction = vi.fn<any>().mockReturnValue(createMockPromiEvent({
          transactionHash: "0xinteracttxhash",
        }));

        renderComponent(
          createStoreWithCallback({
            requestParams: { ...contractInteractionRequest, ...fields },
            qrlStore: {
              qrlInstance: {
                getTransactionCount: async () => 0,
                accounts: { signTransaction: mockSignTransaction },
                sendSignedTransaction: mockSendSignedTransaction,
              } as any,
            },
          }),
          { transactionType: SEND_TRANSACTION_TYPES.CONTRACT_INTERACTION },
        );

        await act(async () => {
          await capturedPermissionCallback!(true);
        });

        const signedTx = mockSignTransaction.mock.calls[0][0] as Record<string, unknown>;
        expect(signedTx).toMatchObject({
          type: "0x2",
          maxFeePerGas: "0xc8",
          maxPriorityFeePerGas: "100",
        });
        expect(signedTx).not.toHaveProperty("gasPrice");
        expect(mockSendSignedTransaction).toHaveBeenCalledWith("0xsignedinteract");
      },
    );

    it("should handle error when signing returns no rawTransaction", async () => {
      const mockAddToResponseData = vi.fn();

      renderComponent(
        createStoreWithCallback({
          requestParams: contractDeploymentRequest,
          qrlStore: {
            qrlInstance: {
              getGasPrice: async () => BigInt(1000),
              getTransactionCount: async () => 0,
              accounts: {
                signTransaction: async () => ({
                  rawTransaction: undefined,
                }),
              },
            } as any,
          },
          addToResponseData: mockAddToResponseData,
        }),
        { transactionType: SEND_TRANSACTION_TYPES.CONTRACT_DEPLOYMENT },
      );

      await act(async () => {
        await capturedPermissionCallback!(true);
      });

      expect(mockAddToResponseData).toHaveBeenCalledWith({
        error: expect.objectContaining({
          message: "Transaction could not be signed",
        }),
      });
    });
  });

  describe("a request that names another transaction type", () => {
    it.each([
      ["a QRL transfer", SEND_TRANSACTION_TYPES.QRL_TRANSFER, zndTransferRequest],
      [
        "a contract interaction",
        SEND_TRANSACTION_TYPES.CONTRACT_INTERACTION,
        contractInteractionRequest,
      ],
    ])(
      "should answer %s with an error and sign nothing",
      async (_label, transactionType, request) => {
        const mockSignTransaction = vi.fn<any>();
        const mockSendSignedTransaction = vi.fn<any>();
        const mockAddToResponseData = vi.fn();

        renderComponent(
          createStoreWithCallback({
            requestParams: { ...request, type: "0x0", gasPrice: "0x3b9aca00" },
            qrlStore: {
              qrlInstance: {
                getTransactionCount: async () => 0,
                accounts: { signTransaction: mockSignTransaction },
                sendSignedTransaction: mockSendSignedTransaction,
              } as any,
            },
            addToResponseData: mockAddToResponseData,
          }),
          { transactionType },
        );

        await act(async () => {
          await capturedPermissionCallback!(true);
        });

        expect(mockAddToResponseData).toHaveBeenCalledWith({
          error: expect.objectContaining({
            message: 'QRL transactions are of type 0x2. Received type: "0x0"',
          }),
        });
        expect(mockSignTransaction).not.toHaveBeenCalled();
        expect(mockSendSignedTransaction).not.toHaveBeenCalled();
      },
    );
  });

  describe("a stored request that still names its call data as input", () => {
    // The service worker stores a request with its call data as `data`.
    // This is the approval's own check, for a request that came another way.
    it.each([
      [
        "a QRL transfer",
        SEND_TRANSACTION_TYPES.QRL_TRANSFER,
        { ...zndTransferRequest, input: "0xa9059cbb" },
      ],
      [
        "a contract interaction",
        SEND_TRANSACTION_TYPES.CONTRACT_INTERACTION,
        { ...contractInteractionRequest, input: "0xa9059cbb" },
      ],
    ])(
      "should answer %s with an error and sign nothing",
      async (_label, transactionType, request) => {
        const mockSignTransaction = vi.fn<any>();
        const mockSendSignedTransaction = vi.fn<any>();
        const mockAddToResponseData = vi.fn();

        renderComponent(
          createStoreWithCallback({
            requestParams: request,
            qrlStore: {
              qrlInstance: {
                getTransactionCount: async () => 0,
                accounts: { signTransaction: mockSignTransaction },
                sendSignedTransaction: mockSendSignedTransaction,
              } as any,
            },
            addToResponseData: mockAddToResponseData,
          }),
          { transactionType },
        );

        await act(async () => {
          await capturedPermissionCallback!(true);
        });

        expect(mockAddToResponseData).toHaveBeenCalledWith({
          error: expect.objectContaining({
            message:
              'The request names call data as "input", which the approval does not read',
          }),
        });
        expect(mockSignTransaction).not.toHaveBeenCalled();
        expect(mockSendSignedTransaction).not.toHaveBeenCalled();
      },
    );
  });

  describe("with the library's own signer", () => {
    const chain = {
      request: async ({ method }: { method: string }) => {
        if (method === "qrl_chainId") return "0x301825";
        if (method === "net_version") return "3151909";
        throw new Error(`unexpected ${method}`);
      },
    };

    // The request the library hands to an injected provider for
    // contract.methods.deposit(...).send(...), caught on its way out.
    const contractCallFromLibrary = async (from: string, contract: string) => {
      const sent: any[] = [];
      const dApp = new Web3({
        request: async ({ method, params }: { method: string; params?: any[] }) => {
          if (method === "qrl_sendTransaction") {
            sent.push(params?.[0]);
            throw new Error("captured");
          }
          if (method === "qrl_chainId") return "0x301825";
          if (method === "net_version") return "3151909";
          if (method === "qrl_getTransactionCount") return "0x1";
          if (method === "qrl_estimateGas") return "0x186a0";
          if (method === "qrl_maxPriorityFeePerGas") return "0x3b9aca00";
          if (method === "qrl_call") return "0x";
          if (method === "qrl_getBlockByNumber")
            return {
              baseFeePerGas: "0x3b9aca00",
              number: "0x10",
              hash: `0x${"11".repeat(32)}`,
              transactions: [],
            };
          throw new Error(`unexpected ${method}`);
        },
      } as any);
      const payable = [
        {
          type: "function",
          name: "deposit",
          stateMutability: "payable",
          inputs: [{ name: "beneficiary", type: "address" }],
          outputs: [],
        },
      ] as const;
      await new dApp.qrl.Contract(payable as any, contract).methods
        .deposit(from)
        .send({ from, value: "1000000000000000000", gas: "100000" })
        .catch(() => undefined);
      // As JSON, the way a request crosses from the page to the worker.
      return JSON.parse(JSON.stringify(sent[0])) as Record<string, string>;
    };

    it("should sign a contract call made with the library with its call data and its value", async () => {
      const web3 = new Web3(chain);
      // A throwaway account, made for this test run.
      const account = web3.qrl.accounts.create();
      const contract = `Q${"ef".repeat(64)}`;
      const fromLibrary = await contractCallFromLibrary(account.address, contract);
      // The library names the call data `input`, sends no `data` and no type.
      expect(fromLibrary.input).toMatch(/^0xf340fa01/);
      expect(fromLibrary.data).toBeUndefined();
      expect(fromLibrary.type).toBeUndefined();
      const mockSendSignedTransaction = vi.fn<any>().mockReturnValue(createMockPromiEvent({
        transactionHash: "0xtxhash",
      }));
      const mockAddToResponseData = vi.fn();

      renderComponent(
        createStoreWithCallback({
          // What the service worker stores for the approval.
          requestParams: withCallDataAsData(fromLibrary),
          qrlStore: {
            qrlInstance: {
              getTransactionCount: async () => 7n,
              accounts: {
                signTransaction: (transaction: any, seed: string) =>
                  web3.qrl.accounts.signTransaction(transaction, seed),
              },
              sendSignedTransaction: mockSendSignedTransaction,
            } as any,
            getGasFeeData: async () => ({
              baseFeePerGas: 100n,
              maxFeePerGas: 200n,
              maxPriorityFeePerGas: 100n,
            }),
          },
          lockStore: { getAccountSeed: async () => account.seed },
          addToResponseData: mockAddToResponseData,
        }),
        { transactionType: SEND_TRANSACTION_TYPES.CONTRACT_INTERACTION },
      );

      await act(async () => {
        await capturedPermissionCallback!(true);
      });

      expect(mockAddToResponseData).toHaveBeenCalledWith({
        transactionHash: "0xtxhash",
      });
      const rawTransaction = mockSendSignedTransaction.mock.calls[0][0] as string;
      const sent = qrl.accounts.TransactionFactory.fromSerializedData(
        hexToBytes(rawTransaction),
      );
      expect(sent.type).toBe(2);
      expect(sent.toJSON()).toMatchObject({
        data: fromLibrary.input,
        value: "0xde0b6b3a7640000",
      });
      expect(sent.to?.toString().toLowerCase()).toBe(contract.toLowerCase());
      expect(sent.verifySignature()).toBe(true);
    }, 60000);

    it.each([
      ["names type 0x2", { type: "0x2" }],
      ["names type 0x02", { type: "0x02" }],
      ["names no type", {}],
      ["carries a gas price", { gasPrice: "0x3b9aca00" }],
    ])(
      "should broadcast a signed type 2 transaction when the request %s",
      async (_label, fields) => {
        const web3 = new Web3(chain);
        // A throwaway account, made for this test run.
        const account = web3.qrl.accounts.create();
        const to = `Q${"cd".repeat(64)}`;
        const mockSendSignedTransaction = vi.fn<any>().mockReturnValue(createMockPromiEvent({
          transactionHash: "0xtxhash",
        }));
        const mockAddToResponseData = vi.fn();

        renderComponent(
          createStoreWithCallback({
            requestParams: {
              from: account.address,
              to,
              value: "0x30",
              gas: "0x5208",
              ...fields,
            },
            qrlStore: {
              qrlInstance: {
                getTransactionCount: async () => 7n,
                accounts: {
                  signTransaction: (transaction: any, seed: string) =>
                    web3.qrl.accounts.signTransaction(transaction, seed),
                },
                sendSignedTransaction: mockSendSignedTransaction,
              } as any,
              getGasFeeData: async () => ({
                baseFeePerGas: 100n,
                maxFeePerGas: 200n,
                maxPriorityFeePerGas: 100n,
              }),
            },
            lockStore: { getAccountSeed: async () => account.seed },
            addToResponseData: mockAddToResponseData,
          }),
          { transactionType: SEND_TRANSACTION_TYPES.QRL_TRANSFER },
        );

        await act(async () => {
          await capturedPermissionCallback!(true);
        });

        expect(mockAddToResponseData).toHaveBeenCalledWith({
          transactionHash: "0xtxhash",
        });
        const rawTransaction = mockSendSignedTransaction.mock.calls[0][0] as string;
        const sent = qrl.accounts.TransactionFactory.fromSerializedData(
          hexToBytes(rawTransaction),
        );
        expect(sent.type).toBe(2);
        expect(sent.toJSON()).toMatchObject({
          nonce: "0x7",
          gasLimit: "0x5208",
          maxFeePerGas: "0xc8",
          maxPriorityFeePerGas: "0x64",
          value: "0x30",
        });
        expect(sent.to?.toString().toLowerCase()).toBe(to.toLowerCase());
        expect(sent.verifySignature()).toBe(true);
      },
      30000,
    );
  });

  describe("onPermissionCallBack", () => {
    it("should not execute transaction when hasApproved is false", async () => {
      const mockSendSignedTransaction = vi.fn<any>();

      renderComponent(
        createStoreWithCallback({
          qrlStore: {
            qrlInstance: {
              getGasPrice: async () => BigInt(1000),
              getTransactionCount: async () => 0,
              sendSignedTransaction: mockSendSignedTransaction,
            } as any,
          },
        }),
        { transactionType: SEND_TRANSACTION_TYPES.QRL_TRANSFER },
      );

      await act(async () => {
        await capturedPermissionCallback!(false);
      });

      expect(mockSendSignedTransaction).not.toHaveBeenCalled();
    });
  });

  describe("copyData", () => {
    it("should copy data to clipboard when copy button is clicked", async () => {
      const mockWriteText = vi.fn<any>();
      Object.assign(navigator, {
        clipboard: { writeText: mockWriteText },
      });

      renderComponent(
        mockedStore({
          dAppRequestStore: {
            dAppRequestData: {
              params: [contractInteractionRequest],
            },
          },
        }),
        { transactionType: SEND_TRANSACTION_TYPES.CONTRACT_INTERACTION },
      );

      const dataTab = screen.getByRole("tab", { name: "Data" });
      await userEvent.click(dataTab);

      const copyButton = screen.getByRole("button");
      await userEvent.click(copyButton);

      expect(mockWriteText).toHaveBeenCalledWith(contractInteractionRequest.data);
    });
  });
});
