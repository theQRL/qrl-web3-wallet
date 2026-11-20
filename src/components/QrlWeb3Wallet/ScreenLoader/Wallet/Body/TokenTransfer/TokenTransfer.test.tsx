import { mockedStore } from "@/__mocks__/mockedStore";
import { BALANCE_UNAVAILABLE } from "@/stores/qrlStore";
import { StoreProvider } from "@/stores/store";
import { QRL_EXAMPLE_ADDRESS } from "@/constants/address";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "@/i18n";
import { observable } from "mobx";
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
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    mockGetTransactionValues.mockResolvedValue({
      receiverAddress: "",
      amount: 0,
    });
    mockSetTransactionValues.mockResolvedValue(undefined);
    mockClearTransactionValues.mockResolvedValue(undefined);
  });

  const renderComponent = (mockedStoreValues = mockedStore()) => {
    return render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <TokenTransfer />
        </MemoryRouter>
      </StoreProvider>,
    );
  };

  const renderComponentWithState = (
    state: Record<string, any>,
    mockedStoreValues = mockedStore(),
  ) => {
    return render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter initialEntries={[{ pathname: "/token-transfer", state }]}>
          <TokenTransfer />
        </MemoryRouter>
      </StoreProvider>,
    );
  };

  const fillForm = async (amount: string) => {
    const user = userEvent.setup();
    const receiverAddressField = screen.getByRole("textbox", {
      name: "receiverAddress",
    });
    const amountField = screen.getByRole("spinbutton", { name: "amount" });
    await user.click(receiverAddressField);
    await user.paste(
      "Q0000000000000000000000000000000000000000000000000000000020fb08ff1f1376a14c055e9f56df80563e16722b00000000000000000000000000000000",
    );
    await user.type(amountField, amount);
  };

  const fillAndSubmitForm = async (buttonName = "Send QRL", amount = "2.5") => {
    await fillForm(amount);
    const sendButton = screen.getByRole("button", { name: buttonName });
    await waitFor(() => expect(sendButton).toBeEnabled());
    await act(async () => {
      await userEvent.click(sendButton);
    });
  };

  it.each([false, true])(
    "keeps Send disabled when the native balance is unavailable (QRC20: %s)",
    async (isQrc20Token) => {
      const getAccountSeed = vi.fn(async () => "");
      const signNativeToken = vi.fn(async () => successSignResult);
      const signQrc20Token = vi.fn(async () => successSignResult);
      renderComponentWithState(
        {
          tokenDetails: {
            isQrc20Token,
            tokenContractAddress: QRL_EXAMPLE_ADDRESS,
            tokenDecimals: 18,
            tokenImage: "",
            tokenBalance: "100 TST",
            tokenName: "Test Token",
            tokenSymbol: isQrc20Token ? "TST" : "QRL",
          },
        },
        mockedStore({
          lockStore: { getAccountSeed },
          qrlStore: {
            getAccountBalance: () => BALANCE_UNAVAILABLE,
            getNativeTokenGas: async () => "0.001",
            getQrc20TokenGas: async () => "0.001",
            signNativeToken,
            signQrc20Token,
          },
        }),
      );

      expect(await screen.findByText(
        "Balance unavailable. Check the network connection and try again.",
      )).toBeInTheDocument();
      await fillForm("2.5");
      const sendButton = screen.getByRole("button", {
        name: `Send ${isQrc20Token ? "TST" : "QRL"}`,
      });
      expect(sendButton).toBeDisabled();
      await userEvent.click(sendButton);
      expect(screen.queryByText(/Insufficient/)).not.toBeInTheDocument();
      expect(getAccountSeed).not.toHaveBeenCalled();
      expect(signNativeToken).not.toHaveBeenCalled();
      expect(signQrc20Token).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["de", "Guthaben nicht verfügbar. Prüfe die Netzwerkverbindung und versuche es erneut."],
    ["es", "Saldo no disponible. Comprueba la conexión de red e inténtalo de nuevo."],
  ])("translates the unavailable balance error in %s", async (language, message) => {
    await i18n.changeLanguage(language);
    renderComponent(mockedStore({
      qrlStore: { getAccountBalance: () => BALANCE_UNAVAILABLE },
    }));
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("updates the balance error when a failed balance request recovers", async () => {
    const balance = observable.box(BALANCE_UNAVAILABLE);
    const store = mockedStore({
      qrlStore: {
        getAccountBalance: () => balance.get(),
        getNativeTokenGas: async () => "0.001",
      },
    });
    renderComponent(store);
    await fillForm("2.5");
    const sendButton = screen.getByRole("button", { name: "Send QRL" });
    expect(sendButton).toBeDisabled();
    act(() => {
      balance.set("100 QRL");
    });
    await waitFor(() => expect(sendButton).toBeEnabled());
    expect(screen.queryByText(
      "Balance unavailable. Check the network connection and try again.",
    )).not.toBeInTheDocument();
  });

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
    const user = userEvent.setup();
    renderComponent();

    const receiverAddressField = screen.getByRole("textbox", {
      name: "receiverAddress",
    });
    const amountField = screen.getByRole("spinbutton", { name: "amount" });
    await user.click(receiverAddressField);
    await user.paste(
      "Q0000000000000000000000000000000000000000000000000000000020fb08ff1f1376a14c055e9f56df80563e16722b00000000000000000000000000000000",
    );
    await user.type(amountField, "2.5");
    const sendQuantaButton = screen.getByRole("button", {
      name: "Send QRL",
    });
    expect(sendQuantaButton).toBeInTheDocument();
    await waitFor(() => expect(sendQuantaButton).toBeEnabled());
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

  describe("a native amount of more digits than a number holds", () => {
    const RECEIVER =
      "Q0000000000000000000000000000000000000000000000000000000020fb08ff1f1376a14c055e9f56df80563e16722b00000000000000000000000000000000";
    // 18 significant digits; the form's number keeps about 17 of them.
    const TYPED = "0.123456789012345678";
    const PLANCK = 123456789012345678n;

    // The field is set in one step, as a browser holds the text; typing it
    // key by key goes through the test library's own number handling.
    const fillAndSend = async () => {
      await fillForm("1");
      fireEvent.change(screen.getByRole("spinbutton", { name: "amount" }), {
        target: { value: TYPED },
      });
      const sendButton = screen.getByRole("button", { name: "Send QRL" });
      await waitFor(() => expect(sendButton).toBeEnabled());
      await act(async () => {
        await userEvent.click(sendButton);
      });
    };

    it("should hand the amount to the signing as it was typed and keep the signed value for a replacement", async () => {
      const mockSignNativeToken = vi.fn<any>().mockResolvedValue({
        ...successSignResult,
        value: PLANCK.toString(),
      });
      const mockAddTransaction = vi.fn<any>().mockResolvedValue(undefined);

      renderComponent(
        mockedStore({
          qrlStore: {
            signNativeToken: mockSignNativeToken,
            sendRawTransaction: vi.fn<any>().mockResolvedValue(undefined),
          },
          transactionHistoryStore: { addTransaction: mockAddTransaction },
        }),
      );

      await fillAndSend();

      expect(mockSignNativeToken).toHaveBeenCalledWith(
        expect.any(String),
        RECEIVER,
        TYPED,
        expect.any(String),
        undefined,
      );
      expect(mockAddTransaction).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ value: PLANCK.toString() }),
      );
    });

    it("should sign exactly that amount with a Ledger account", async () => {
      const mockSignAndSerializeTransaction = vi
        .fn<any>()
        .mockResolvedValue("0x02f8a00180843b9aca00843b9aca0082520894");
      const mockAddTransaction = vi.fn<any>().mockResolvedValue(undefined);

      renderComponent(
        mockedStore({
          ledgerStore: {
            isLedgerAccount: () => true,
            signAndSerializeTransaction: mockSignAndSerializeTransaction,
          } as any,
          qrlStore: {
            qrlInstance: {
              getTransactionCount: async () => 0,
              getChainId: async () => 1,
            } as any,
            sendRawTransaction: vi.fn<any>().mockResolvedValue(undefined),
          },
          transactionHistoryStore: { addTransaction: mockAddTransaction },
        }),
      );

      await fillAndSend();

      expect(mockSignAndSerializeTransaction).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          to: RECEIVER,
          value: `0x${PLANCK.toString(16)}`,
        }),
        expect.anything(),
      );
      expect(mockAddTransaction).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ value: PLANCK.toString() }),
      );
    });
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

  it("should sign QRC20 token and add pending transaction when token details are set from state", async () => {
    const mockSignQrc20Token = vi.fn<any>().mockResolvedValue({
      ...successSignResult,
      data: "0xcontractdata",
    });
    const mockAddTransaction = vi.fn<any>().mockResolvedValue(undefined);

    renderComponentWithState(
      {
        tokenDetails: {
          isQrc20Token: true,
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
          signQrc20Token: mockSignQrc20Token,
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
    expect(mockSignQrc20Token).toHaveBeenCalled();
    expect(mockAddTransaction).toHaveBeenCalledWith(
      "Q000000000000000000000000000000000000000000000000000000008a8eafb1cf62bfbeb1741769dae1a9dd4799619200000000000000000000000000000000",
      expect.objectContaining({
        pendingStatus: "pending",
        tokenSymbol: "TST",
      }),
    );
  });

  it("should sign QRC20 token transfer with Ledger account", async () => {
    const mockSignQrc20Token = vi.fn<any>();
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
          isQrc20Token: true,
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
          signQrc20Token: mockSignQrc20Token,
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

    expect(mockSignQrc20Token).not.toHaveBeenCalled();
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

  it("should hand a QRC20 amount to the fee estimate and to the signing as it was typed", async () => {
    const contract =
      "Q000000000000000000000000000000000000000000000000000000001234567890abcdef1234567890abcdef1234567800000000000000000000000000000000";
    const mockGetQrc20TokenGas = vi.fn<any>(async () => "0.001");
    const mockSignQrc20Token = vi.fn<any>().mockResolvedValue({
      ...successSignResult,
      data: "0xcontractdata",
    });

    renderComponentWithState(
      {
        tokenDetails: {
          isQrc20Token: true,
          tokenContractAddress: contract,
          tokenDecimals: 18,
          tokenImage: "token.png",
          tokenBalance: "100.0",
          tokenName: "Test Token",
          tokenSymbol: "TST",
        },
      },
      mockedStore({
        qrlStore: {
          // Enough native balance to pay the estimated fee.
          getAccountBalance: () => "5.0 QRL",
          getQrc20TokenGas: mockGetQrc20TokenGas,
          signQrc20Token: mockSignQrc20Token,
          sendRawTransaction: vi.fn<any>().mockResolvedValue(undefined),
        },
        transactionHistoryStore: {
          addTransaction: vi.fn<any>().mockResolvedValue(undefined),
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Send TST")).toBeInTheDocument();
    });

    // 19 significant digits: a number keeps about 17 of them. The field is
    // set in one step, as a browser holds the text; typing it key by key
    // goes through the test library's own number handling, which rounds.
    await fillForm("1");
    const amountField = screen.getByRole("spinbutton", { name: "amount" });
    fireEvent.change(amountField, {
      target: { value: "1.123456789012345678" },
    });
    const sendButton = screen.getByRole("button", { name: "Send TST" });
    await waitFor(() => expect(sendButton).toBeEnabled());
    await act(async () => {
      await userEvent.click(sendButton);
    });

    expect(mockGetQrc20TokenGas).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      "1.123456789012345678",
      contract,
      18,
      expect.anything(),
    );
    expect(mockSignQrc20Token).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "1.123456789012345678",
      expect.any(String),
      contract,
      18,
      undefined,
    );
  });

  it("should sign the typed amount exactly for a Ledger QRC20 transfer", async () => {
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
          isQrc20Token: true,
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
          signAndSerializeTransaction: vi
            .fn<any>()
            .mockResolvedValue("0x02f8a00180843b9aca00843b9aca0082520894"),
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
          sendRawTransaction: vi.fn<any>().mockResolvedValue(undefined),
        },
        transactionHistoryStore: {
          addTransaction: vi.fn<any>().mockResolvedValue(undefined),
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Send TST")).toBeInTheDocument();
    });

    // 1.1 * 10 ** 18 is 1100000000000000128 in floating point.
    await fillAndSubmitForm("Send TST", "1.1");

    expect(mockTransfer).toHaveBeenCalledWith(
      expect.any(String),
      1100000000000000000n,
    );
  });

  it("should load token details from storage when no state is provided", async () => {
    mockGetTransactionValues.mockResolvedValue({
      receiverAddress: "",
      amount: 0,
      tokenDetails: {
        isQrc20Token: true,
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

    await fillForm("10");

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

    await fillForm("5");

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

  it("should display insufficient token balance error for QRC-20 when amount exceeds token balance", async () => {
    renderComponentWithState(
      {
        tokenDetails: {
          isQrc20Token: true,
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
          getQrc20TokenGas: vi.fn(async () => "0.001"),
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Send TST")).toBeInTheDocument();
    });

    await fillForm("100");

    await waitFor(
      () => {
        expect(
          screen.getByText("Insufficient TST balance"),
        ).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it("should display insufficient gas error for QRC-20 when native balance cannot cover gas", async () => {
    renderComponentWithState(
      {
        tokenDetails: {
          isQrc20Token: true,
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
          getQrc20TokenGas: vi.fn(async () => "0.001"),
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Send TST")).toBeInTheDocument();
    });

    await fillForm("10");

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
