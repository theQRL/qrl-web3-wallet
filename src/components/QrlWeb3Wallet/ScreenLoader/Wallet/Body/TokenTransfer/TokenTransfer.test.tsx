import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TokenTransfer from "./TokenTransfer";

const {
  mockGetTransactionValues,
  mockSetTransactionValues,
  mockClearTransactionValues,
} = vi.hoisted(() => ({
  mockGetTransactionValues: vi.fn<any>().mockResolvedValue({
    receiverAddress: "",
    amount: 0,
  }),
  mockSetTransactionValues: vi.fn<any>().mockResolvedValue(undefined),
  mockClearTransactionValues: vi.fn<any>().mockResolvedValue(undefined),
}));

vi.mock("@/utilities/storageUtil", async () => {
  return {
    __esModule: true,
    default: {
      getTransactionValues: (...args: any[]) =>
        mockGetTransactionValues(...args),
      setTransactionValues: (...args: any[]) =>
        mockSetTransactionValues(...args),
      clearTransactionValues: (...args: any[]) =>
        mockClearTransactionValues(...args),
      getActiveBlockChain: async () => ({ chainId: "0x1" }),
    },
  };
});

const successSignResult = {
  transactionHash: "0xtxhash",
  rawTransaction: "0xraw",
  error: "",
  nonce: 0,
  maxFeePerGas: "1000",
  maxPriorityFeePerGas: "100",
  gasLimit: 21000,
};

describe("TokenTransfer", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mockGetTransactionValues.mockResolvedValue({
      receiverAddress: "",
      amount: 0,
    });
    mockSetTransactionValues.mockResolvedValue(undefined);
    mockClearTransactionValues.mockResolvedValue(undefined);
  });

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <TokenTransfer />
        </MemoryRouter>
      </StoreProvider>,
    );

  const renderComponentWithState = (
    state: Record<string, any>,
    mockedStoreValues = mockedStore(),
  ) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter initialEntries={[{ pathname: "/token-transfer", state }]}>
          <TokenTransfer />
        </MemoryRouter>
      </StoreProvider>,
    );

  const fillAndSubmitForm = async (buttonName = "Send QRL") => {
    const receiverAddressField = screen.getByRole("textbox", {
      name: "receiverAddress",
    });
    const amountField = screen.getByRole("spinbutton", { name: "amount" });
    await waitFor(
      async () => {
        await userEvent.type(
          receiverAddressField,
          "Q0000000000000000000000000000000000000000000000000000000020fb08ff1f1376a14c055e9f56df80563e16722b00000000000000000000000000000000",
        );
        await userEvent.type(amountField, "2.5");
      },
      { timeout: 5000 },
    );
    const sendButton = screen.getByRole("button", { name: buttonName });
    expect(sendButton).toBeEnabled();
    await act(async () => {
      await userEvent.click(sendButton);
    });
  };

  it("should render the account details component", () => {
    renderComponent();

    expect(screen.getByText("Active account")).toBeInTheDocument();
    expect(screen.getByText("Account address")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Q 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 08a8e AfB1C F62bF bEb17 41769 DaE1A 9dd47 99619 20000 00000 00000 00000 00000 00000 000",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Balance")).toBeInTheDocument();
    expect(screen.getByText("0.0 QRL")).toBeInTheDocument();
    expect(screen.getByText("Make a transaction")).toBeInTheDocument();
    expect(screen.getByText("Send to")).toBeInTheDocument();
    const receiverAddressField = screen.getByRole("textbox", {
      name: "receiverAddress",
    });
    expect(receiverAddressField).toBeInTheDocument();
    expect(receiverAddressField).toBeEnabled();
    expect(screen.getByText("Amount")).toBeInTheDocument();
    const amountField = screen.getByRole("spinbutton", { name: "amount" });
    expect(amountField).toBeInTheDocument();
    expect(amountField).toBeEnabled();
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton).toBeInTheDocument();
    expect(cancelButton).toBeEnabled();
    const sendQuantaButton = screen.getByRole("button", {
      name: "Send QRL",
    });
    expect(sendQuantaButton).toBeInTheDocument();
    expect(sendQuantaButton).toBeDisabled();
  });

  it("should enable the send quanta button once receiver address, amount and mnemonic phrases are entered", async () => {
    renderComponent();

    const receiverAddressField = screen.getByRole("textbox", {
      name: "receiverAddress",
    });
    const amountField = screen.getByRole("spinbutton", { name: "amount" });
    await waitFor(
      async () => {
        await userEvent.type(
          receiverAddressField,
          "Q0000000000000000000000000000000000000000000000000000000020fb08ff1f1376a14c055e9f56df80563e16722b00000000000000000000000000000000",
        );
        await userEvent.type(amountField, "2.5");
      },
      { timeout: 5000 },
    );
    const sendQuantaButton = screen.getByRole("button", {
      name: "Send QRL",
    });
    expect(sendQuantaButton).toBeInTheDocument();
    expect(sendQuantaButton).toBeEnabled();
  });

  it("should display the error message if amount is not valid", async () => {
    renderComponent();

    const amountField = screen.getByRole("spinbutton", { name: "amount" });
    await waitFor(async () => {
      await userEvent.type(amountField, "-2.5");
    });
    expect(
      screen.getByText("Amount should be more than 0"),
    ).toBeInTheDocument();
  });

  it("should sign and add pending transaction for Ledger account", async () => {
    const mockAddTransaction = vi.fn<any>().mockResolvedValue(undefined);
    const validRawTxHex = "0x02f8a00180843b9aca00843b9aca0082520894";

    renderComponent(
      mockedStore({
        ledgerStore: {
          isLedgerAccount: () => true,
          signAndSerializeTransaction: async () => validRawTxHex,
        } as any,
        qrlStore: {
          qrlInstance: {
            getTransactionCount: async () => 0,
            getChainId: async () => 1,
          } as any,
          sendRawTransaction: vi.fn<any>().mockResolvedValue(undefined),
        },
        transactionHistoryStore: {
          addTransaction: mockAddTransaction,
        },
      }),
    );

    await fillAndSubmitForm();
    expect(mockAddTransaction).toHaveBeenCalledWith(
      "Q000000000000000000000000000000000000000000000000000000008a8eafb1cf62bfbeb1741769dae1a9dd4799619200000000000000000000000000000000",
      expect.objectContaining({
        pendingStatus: "pending",
        status: false,
        tokenSymbol: "QRL",
      }),
    );
  });

  it("should display error when Ledger signing fails", async () => {
    renderComponent(
      mockedStore({
        ledgerStore: {
          isLedgerAccount: () => true,
          signAndSerializeTransaction: async () => {
            throw new Error("User rejected on device");
          },
        } as any,
        qrlStore: {
          qrlInstance: {
            getTransactionCount: async () => 0,
            getChainId: async () => 1,
          } as any,
        },
      }),
    );

    await fillAndSubmitForm();
    expect(screen.getByText(/User rejected on device/)).toBeInTheDocument();
  });

  it("should add pending transaction and navigate home on successful sign", async () => {
    const mockAddTransaction = vi.fn<any>().mockResolvedValue(undefined);
    renderComponent(
      mockedStore({
        qrlStore: {
          signNativeToken: async () => successSignResult,
          sendRawTransaction: vi.fn<any>().mockResolvedValue(undefined),
        },
        transactionHistoryStore: {
          addTransaction: mockAddTransaction,
        },
      }),
    );

    await fillAndSubmitForm();
    expect(mockAddTransaction).toHaveBeenCalledWith(
      "Q000000000000000000000000000000000000000000000000000000008a8eafb1cf62bfbeb1741769dae1a9dd4799619200000000000000000000000000000000",
      expect.objectContaining({
        transactionHash: "0xtxhash",
        pendingStatus: "pending",
        status: false,
      }),
    );
  });

  it("should call addTransaction with pending entry on successful sign", async () => {
    const mockAddTransaction = vi.fn<any>().mockResolvedValue(undefined);
    renderComponent(
      mockedStore({
        qrlStore: {
          signNativeToken: async () => successSignResult,
          sendRawTransaction: vi.fn<any>().mockResolvedValue(undefined),
        },
        transactionHistoryStore: {
          addTransaction: mockAddTransaction,
        },
      }),
    );

    await fillAndSubmitForm();
    expect(mockAddTransaction).toHaveBeenCalledWith(
      "Q000000000000000000000000000000000000000000000000000000008a8eafb1cf62bfbeb1741769dae1a9dd4799619200000000000000000000000000000000",
      expect.objectContaining({
        transactionHash: "0xtxhash",
        pendingStatus: "pending",
        tokenSymbol: "QRL",
        blockNumber: "",
        gasUsed: "",
      }),
    );
  });

  it("should navigate home when cancel button is clicked", async () => {
    renderComponent();

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await act(async () => {
      await userEvent.click(cancelButton);
    });
    expect(mockClearTransactionValues).toHaveBeenCalled();
  });

  it("should display error when signing returns an error", async () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          signNativeToken: async () => ({
            error: "Insufficient funds",
          }),
        },
      }),
    );

    await fillAndSubmitForm();
    expect(screen.getByText(/Insufficient funds/)).toBeInTheDocument();
  });

  it("should display error when onSubmit throws an exception", async () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          signNativeToken: async () => {
            throw new Error("Network timeout");
          },
        },
      }),
    );

    await fillAndSubmitForm();
    expect(screen.getByText(/Network timeout/)).toBeInTheDocument();
  });

  it("should sign ZRC20 token and add pending transaction when token details are set from state", async () => {
    const mockSignZrc20Token = vi.fn<any>().mockResolvedValue({
      ...successSignResult,
      data: "0xcontractdata",
    });
    const mockAddTransaction = vi.fn<any>().mockResolvedValue(undefined);

    renderComponentWithState(
      {
        tokenDetails: {
          isZrc20Token: true,
          tokenContractAddress:
            "Q000000000000000000000000000000000000000000000000000000001234567890abcdef1234567890abcdef1234567800000000000000000000000000000000",
          tokenDecimals: 18,
          tokenImage: "token.png",
          tokenBalance: "100.0",
          tokenName: "Test Token",
          tokenSymbol: "TST",
        },
      },
      mockedStore({
        qrlStore: {
          signZrc20Token: mockSignZrc20Token,
          sendRawTransaction: vi.fn<any>().mockResolvedValue(undefined),
        },
        transactionHistoryStore: {
          addTransaction: mockAddTransaction,
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Send TST")).toBeInTheDocument();
    });

    await fillAndSubmitForm("Send TST");
    expect(mockSignZrc20Token).toHaveBeenCalled();
    expect(mockAddTransaction).toHaveBeenCalledWith(
      "Q000000000000000000000000000000000000000000000000000000008a8eafb1cf62bfbeb1741769dae1a9dd4799619200000000000000000000000000000000",
      expect.objectContaining({
        pendingStatus: "pending",
        tokenSymbol: "TST",
      }),
    );
  });

  it("should sign ZRC20 token transfer with Ledger account", async () => {
    const mockSignZrc20Token = vi.fn<any>();
    const mockSignAndSerializeTransaction = vi
      .fn<any>()
      .mockResolvedValue("0x02f8a00180843b9aca00843b9aca0082520894");
    const mockAddTransaction = vi.fn<any>().mockResolvedValue(undefined);
    const mockTransfer = vi.fn<any>().mockReturnValue({
      encodeABI: () => "0xa9059cbb",
    });
    const MockContract = vi.fn<any>().mockImplementation(() => ({
      methods: {
        transfer: mockTransfer,
      },
    }));

    renderComponentWithState(
      {
        tokenDetails: {
          isZrc20Token: true,
          tokenContractAddress:
            "Q000000000000000000000000000000000000000000000000000000001234567890abcdef1234567890abcdef1234567800000000000000000000000000000000",
          tokenDecimals: 18,
          tokenImage: "token.png",
          tokenBalance: "100.0",
          tokenName: "Test Token",
          tokenSymbol: "TST",
        },
      },
      mockedStore({
        ledgerStore: {
          isLedgerAccount: () => true,
          signAndSerializeTransaction: mockSignAndSerializeTransaction,
        } as any,
        qrlStore: {
          qrlInstance: {
            Contract: MockContract,
            getTransactionCount: async () => 2,
            getChainId: async () => 1,
          } as any,
          getGasFeeData: async () => ({
            baseFeePerGas: BigInt(0),
            maxFeePerGas: BigInt(2250000007),
            maxPriorityFeePerGas: BigInt(2250000000),
          }),
          signZrc20Token: mockSignZrc20Token,
          sendRawTransaction: vi.fn<any>().mockResolvedValue(undefined),
        },
        transactionHistoryStore: {
          addTransaction: mockAddTransaction,
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Send TST")).toBeInTheDocument();
    });

    await fillAndSubmitForm("Send TST");

    expect(mockSignZrc20Token).not.toHaveBeenCalled();
    expect(mockTransfer).toHaveBeenCalled();
    expect(mockSignAndSerializeTransaction).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nonce: "0x2",
        to: "Q000000000000000000000000000000000000000000000000000000001234567890abcdef1234567890abcdef1234567800000000000000000000000000000000",
        value: "0x0",
        data: "0xa9059cbb",
      }),
      expect.anything(),
    );
    expect(mockAddTransaction).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        pendingStatus: "pending",
        tokenSymbol: "TST",
        data: "0xa9059cbb",
      }),
    );
  });

  it("should load token details from storage when no state is provided", async () => {
    mockGetTransactionValues.mockResolvedValue({
      receiverAddress: "",
      amount: 0,
      tokenDetails: {
        isZrc20Token: true,
        tokenContractAddress:
          "Q00000000000000000000000000000000000000000000000000000000abcdef1234567890abcdef1234567890abcdef1200000000000000000000000000000000",
        tokenDecimals: 8,
        tokenImage: "stored-token.png",
        tokenBalance: "200.0",
        tokenName: "Stored Token",
        tokenSymbol: "STK",
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Send STK")).toBeInTheDocument();
    });
  });

  it("should reset form when shouldStartFresh state is true", async () => {
    renderComponentWithState({ shouldStartFresh: true });

    await waitFor(() => {
      expect(mockClearTransactionValues).toHaveBeenCalled();
    });
  });

  it("should display insufficient balance error when native QRL amount exceeds balance", async () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          getAccountBalance: () => "5.0 QRL",
          getNativeTokenGas: vi.fn(async () => "0.001"),
        },
      }),
    );

    const receiverAddressField = screen.getByRole("textbox", {
      name: "receiverAddress",
    });
    const amountField = screen.getByRole("spinbutton", { name: "amount" });
    await waitFor(
      async () => {
        await userEvent.type(
          receiverAddressField,
          "Q0000000000000000000000000000000000000000000000000000000020fb08ff1f1376a14c055e9f56df80563e16722b00000000000000000000000000000000",
        );
        await userEvent.type(amountField, "10");
      },
      { timeout: 5000 },
    );

    await waitFor(
      () => {
        expect(
          screen.getByText(
            "Insufficient QRL balance (amount + gas fee exceeds balance)",
          ),
        ).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    const sendButton = screen.getByRole("button", { name: "Send QRL" });
    expect(sendButton).toBeDisabled();
  });

  it("should not display balance error when amount is within balance", async () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          getAccountBalance: () => "100.0 QRL",
          getNativeTokenGas: vi.fn(async () => "0.001"),
        },
      }),
    );

    const receiverAddressField = screen.getByRole("textbox", {
      name: "receiverAddress",
    });
    const amountField = screen.getByRole("spinbutton", { name: "amount" });
    await waitFor(
      async () => {
        await userEvent.type(
          receiverAddressField,
          "Q0000000000000000000000000000000000000000000000000000000020fb08ff1f1376a14c055e9f56df80563e16722b00000000000000000000000000000000",
        );
        await userEvent.type(amountField, "5");
      },
      { timeout: 5000 },
    );

    await waitFor(() => {
      expect(screen.getByText("Gas fee")).toBeInTheDocument();
      expect(screen.getByText("Low")).toBeInTheDocument();
      expect(screen.getByText("Market")).toBeInTheDocument();
      expect(screen.getByText("Aggressive")).toBeInTheDocument();
    });

    expect(screen.queryByText(/Insufficient/)).not.toBeInTheDocument();

    const sendButton = screen.getByRole("button", { name: "Send QRL" });
    expect(sendButton).toBeEnabled();
  });

  it("should display insufficient token balance error for ZRC-20 when amount exceeds token balance", async () => {
    renderComponentWithState(
      {
        tokenDetails: {
          isZrc20Token: true,
          tokenContractAddress:
            "Q000000000000000000000000000000000000000000000000000000001234567890abcdef1234567890abcdef1234567800000000000000000000000000000000",
          tokenDecimals: 18,
          tokenImage: "token.png",
          tokenBalance: "50.0 TST",
          tokenName: "Test Token",
          tokenSymbol: "TST",
        },
      },
      mockedStore({
        qrlStore: {
          getAccountBalance: () => "10.0 QRL",
          getZrc20TokenGas: vi.fn(async () => "0.001"),
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Send TST")).toBeInTheDocument();
    });

    const receiverAddressField = screen.getByRole("textbox", {
      name: "receiverAddress",
    });
    const amountField = screen.getByRole("spinbutton", { name: "amount" });
    await waitFor(
      async () => {
        await userEvent.type(
          receiverAddressField,
          "Q0000000000000000000000000000000000000000000000000000000020fb08ff1f1376a14c055e9f56df80563e16722b00000000000000000000000000000000",
        );
        await userEvent.type(amountField, "100");
      },
      { timeout: 5000 },
    );

    await waitFor(
      () => {
        expect(
          screen.getByText("Insufficient TST balance"),
        ).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it("should display insufficient gas error for ZRC-20 when native balance cannot cover gas", async () => {
    renderComponentWithState(
      {
        tokenDetails: {
          isZrc20Token: true,
          tokenContractAddress:
            "Q000000000000000000000000000000000000000000000000000000001234567890abcdef1234567890abcdef1234567800000000000000000000000000000000",
          tokenDecimals: 18,
          tokenImage: "token.png",
          tokenBalance: "1,000.0 TST",
          tokenName: "Test Token",
          tokenSymbol: "TST",
        },
      },
      mockedStore({
        qrlStore: {
          getAccountBalance: () => "0.0 QRL",
          getZrc20TokenGas: vi.fn(async () => "0.001"),
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Send TST")).toBeInTheDocument();
    });

    const receiverAddressField = screen.getByRole("textbox", {
      name: "receiverAddress",
    });
    const amountField = screen.getByRole("spinbutton", { name: "amount" });
    await waitFor(
      async () => {
        await userEvent.type(
          receiverAddressField,
          "Q0000000000000000000000000000000000000000000000000000000020fb08ff1f1376a14c055e9f56df80563e16722b00000000000000000000000000000000",
        );
        await userEvent.type(amountField, "10");
      },
      { timeout: 5000 },
    );

    await waitFor(
      () => {
        expect(
          screen.getByText("Insufficient QRL for gas fee"),
        ).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });
});
