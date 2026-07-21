import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import type { TransactionHistoryEntry } from "@/types/transactionHistory";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TransactionDetail from "./TransactionDetail";

vi.mock("webextension-polyfill", () => ({
  __esModule: true,
  default: {
    tabs: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/utilities/storageUtil", () => ({
  __esModule: true,
  default: {
    isLedgerAccount: vi.fn<any>().mockResolvedValue(false),
    getActiveBlockChain: vi.fn<any>().mockResolvedValue({ chainId: "0x1" }),
  },
}));

const sampleTransaction: TransactionHistoryEntry = {
  id: "0xabc123def456",
  from: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
  to: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
  amount: 2.5,
  tokenSymbol: "QRL",
  tokenName: "QRL",
  isZrc20Token: false,
  tokenContractAddress: "",
  tokenDecimals: 18,
  transactionHash: "0xabc123def456",
  blockNumber: "100",
  gasUsed: "21000",
  effectiveGasPrice: "1000000000",
  status: true,
  timestamp: 1700000000000,
  chainId: "0x1",
};

const pendingTransaction: TransactionHistoryEntry = {
  ...sampleTransaction,
  pendingStatus: "pending",
  nonce: 5,
  maxFeePerGas: "2000000000",
  maxPriorityFeePerGas: "1000000000",
  gasLimit: 21000,
  blockNumber: "",
  gasUsed: "",
  effectiveGasPrice: "",
};

describe("TransactionDetail", () => {
  afterEach(cleanup);

  const renderComponent = (
    transaction?: TransactionHistoryEntry,
    mockedStoreValues = mockedStore(),
    initialAction?: "speed-up" | "cancel",
  ) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter
          initialEntries={[
            {
              pathname: "/transaction-detail",
              state: transaction
                ? { transaction, action: initialAction }
                : undefined,
            },
          ]}
        >
          <TransactionDetail />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the heading", () => {
    renderComponent(sampleTransaction);

    expect(screen.getByText("Transaction Details")).toBeInTheDocument();
  });

  it("should show transaction not found when no state", () => {
    renderComponent(undefined);

    expect(screen.getByText("Transaction not found")).toBeInTheDocument();
  });

  it("should display amount and token symbol", () => {
    renderComponent(sampleTransaction);

    expect(screen.getByText("Amount")).toBeInTheDocument();
    const amountElement = screen.getByText("2.5 QRL", {
      selector: ".text-lg",
    });
    expect(amountElement).toBeInTheDocument();
  });

  it("should display Confirmed status for successful transaction", () => {
    renderComponent(sampleTransaction);

    expect(screen.getByText("Confirmed")).toBeInTheDocument();
  });

  it("should display Failed status for failed transaction", () => {
    renderComponent({ ...sampleTransaction, status: false });

    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("should display from and to addresses", () => {
    renderComponent(sampleTransaction);

    expect(
      screen.getByText("Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000"),
    ).toBeInTheDocument();
  });

  it("should display transaction hash", () => {
    renderComponent(sampleTransaction);

    expect(screen.getByText("0xabc123def456")).toBeInTheDocument();
  });

  it("should display block number", () => {
    renderComponent(sampleTransaction);

    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("should display gas used", () => {
    renderComponent(sampleTransaction);

    expect(screen.getByText("21,000")).toBeInTheDocument();
  });

  it("should display date and time", () => {
    renderComponent(sampleTransaction);

    expect(screen.getByText("Date & Time")).toBeInTheDocument();
  });

  it("should have a back button", () => {
    renderComponent(sampleTransaction);

    expect(screen.getByTestId("backButtonTestId")).toBeInTheDocument();
  });

  it("should display copy buttons for from, to, and tx hash", () => {
    renderComponent(sampleTransaction);

    expect(screen.getByLabelText("Copy From")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy To")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Copy Transaction Hash"),
    ).toBeInTheDocument();
  });

  it("should copy value to clipboard on copy button click", async () => {
    const writeText = vi.fn<any>().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderComponent(sampleTransaction);

    await userEvent.click(screen.getByLabelText("Copy Transaction Hash"));
    expect(writeText).toHaveBeenCalledWith("0xabc123def456");
  });

  it("should show View on Block Explorer button", () => {
    renderComponent(sampleTransaction);

    expect(screen.getByText("View on Block Explorer")).toBeInTheDocument();
  });

  it("should open block explorer on button click", async () => {
    const browser = (await import("webextension-polyfill")).default;

    renderComponent(sampleTransaction);

    await userEvent.click(screen.getByText("View on Block Explorer"));
    expect(browser.tabs.create).toHaveBeenCalled();
  });

  // ── Pending transaction tests ──

  it("should show Pending badge for pending transaction", () => {
    renderComponent(pendingTransaction);

    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("should show 'Waiting for confirmation...' for pending transaction", () => {
    renderComponent(pendingTransaction);

    expect(screen.getByText("Waiting for confirmation...")).toBeInTheDocument();
  });

  it("should not show block number for pending transaction", () => {
    renderComponent(pendingTransaction);

    expect(screen.queryByText("Block Number")).not.toBeInTheDocument();
  });

  it("should not show View on Block Explorer for pending transaction", () => {
    renderComponent(pendingTransaction);

    expect(screen.queryByText("View on Block Explorer")).not.toBeInTheDocument();
  });

  it("should show Speed Up and Cancel buttons for pending tx with nonce", () => {
    renderComponent(pendingTransaction);

    expect(screen.getByText("Speed Up")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("should not show Speed Up/Cancel buttons for pending tx without nonce", () => {
    renderComponent({
      ...pendingTransaction,
      nonce: undefined,
    });

    expect(screen.queryByRole("button", { name: /speed up/i })).not.toBeInTheDocument();
  });

  it("should display Replaced status badge", () => {
    renderComponent({
      ...sampleTransaction,
      pendingStatus: "replaced",
      replacementTransactionHash: "0xreplacement123",
      replacedByAction: "speed-up",
    });

    expect(screen.getByText("Replaced")).toBeInTheDocument();
  });

  it("should display replacement tx hash for replaced transaction", () => {
    renderComponent({
      ...sampleTransaction,
      pendingStatus: "replaced",
      replacementTransactionHash: "0xreplacement123",
      replacedByAction: "speed-up",
    });

    expect(screen.getByText("Replaced by (Speed Up)")).toBeInTheDocument();
    expect(screen.getByText("0xreplacement123")).toBeInTheDocument();
  });

  it("should display 'Cancelled by' label for cancelled transaction", () => {
    renderComponent({
      ...sampleTransaction,
      pendingStatus: "cancelled",
      replacementTransactionHash: "0xcancel123",
      replacedByAction: "cancel",
    });

    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("Cancelled by")).toBeInTheDocument();
    expect(screen.getByText("0xcancel123")).toBeInTheDocument();
  });

  it("should open speed-up dialog when Speed Up button clicked", async () => {
    renderComponent(pendingTransaction);

    await userEvent.click(screen.getByText("Speed Up"));

    await waitFor(() => {
      expect(screen.getByText("Speed Up Transaction")).toBeInTheDocument();
    });
  });

  it("should open cancel dialog when Cancel button clicked", async () => {
    renderComponent(pendingTransaction);

    await userEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(screen.getAllByText("Cancel Transaction").length).toBeGreaterThan(0);
    });
  });

  it("should auto-open speed-up dialog when navigated with speed-up action", async () => {
    renderComponent(pendingTransaction, mockedStore(), "speed-up");

    await waitFor(() => {
      expect(screen.getByText("Speed Up Transaction")).toBeInTheDocument();
    });
  });

  it("should auto-open cancel dialog when navigated with cancel action", async () => {
    renderComponent(pendingTransaction, mockedStore(), "cancel");

    await waitFor(() => {
      expect(screen.getAllByText("Cancel Transaction").length).toBeGreaterThan(0);
    });
  });

  it("should not call sendRawTransaction for Ledger account replacement", async () => {
    const StorageUtil = (await import("@/utilities/storageUtil")).default;
    (StorageUtil.isLedgerAccount as Mock<any>).mockResolvedValueOnce(true);

    const mockSendRawTransaction = vi.fn<any>();
    const store = mockedStore({
      qrlStore: {
        sendRawTransaction: mockSendRawTransaction,
      },
    });

    renderComponent(pendingTransaction, store);

    await userEvent.click(screen.getByText("Speed Up"));
    await waitFor(() => {
      expect(screen.getByText("Speed Up Transaction")).toBeInTheDocument();
    });

    const dialogButtons = screen.getAllByText("Speed Up");
    await userEvent.click(dialogButtons[dialogButtons.length - 1]);

    // Wait for async handleReplacement to complete
    await waitFor(() => {
      expect(StorageUtil.isLedgerAccount).toHaveBeenCalledWith(pendingTransaction.from);
    });

    expect(mockSendRawTransaction).not.toHaveBeenCalled();
  });

  it("should not call signAndSendReplacement when seed is empty", async () => {
    const mockSign = vi.fn<any>().mockResolvedValue({
      transactionHash: undefined,
      rawTransaction: undefined,
      error: "",
    });
    const mockGetAccountSeed = vi.fn<any>().mockResolvedValue("");
    const store = mockedStore({
      lockStore: {
        getAccountSeed: mockGetAccountSeed,
      },
      qrlStore: {
        signAndSendReplacementTransaction: mockSign,
      },
    });

    renderComponent(pendingTransaction, store);

    await userEvent.click(screen.getByText("Speed Up"));
    await waitFor(() => {
      expect(screen.getByText("Speed Up Transaction")).toBeInTheDocument();
    });

    const dialogButtons = screen.getAllByText("Speed Up");
    await userEvent.click(dialogButtons[dialogButtons.length - 1]);

    await waitFor(() => {
      expect(mockGetAccountSeed).toHaveBeenCalled();
    });

    expect(mockSign).not.toHaveBeenCalled();
  });

  it("should not call sendRawTransaction when signAndSend returns error", async () => {
    const mockSendRaw = vi.fn<any>();
    const mockSign = vi.fn<any>().mockResolvedValue({
      transactionHash: undefined,
      rawTransaction: undefined,
      error: "Insufficient funds for gas",
    });
    const store = mockedStore({
      qrlStore: {
        signAndSendReplacementTransaction: mockSign,
        sendRawTransaction: mockSendRaw,
      },
    });

    renderComponent(pendingTransaction, store);

    await userEvent.click(screen.getByText("Speed Up"));
    await waitFor(() => {
      expect(screen.getByText("Speed Up Transaction")).toBeInTheDocument();
    });

    const dialogButtons = screen.getAllByText("Speed Up");
    await userEvent.click(dialogButtons[dialogButtons.length - 1]);

    await waitFor(() => {
      expect(mockSign).toHaveBeenCalled();
    });

    expect(mockSendRaw).not.toHaveBeenCalled();
  });

  it("should handle successful replacement flow", async () => {
    const mockUpdateTransaction = vi.fn<any>().mockResolvedValue(undefined);
    const mockAddTransaction = vi.fn<any>().mockResolvedValue(undefined);

    const store = mockedStore({
      qrlStore: {
        signAndSendReplacementTransaction: async () => ({
          transactionHash: "0xnewtx123",
          rawTransaction: "0xraw123",
          error: "",
        }),
        sendRawTransaction: async () => ({
          status: BigInt(1),
          blockNumber: BigInt(200),
          gasUsed: BigInt(21000),
          effectiveGasPrice: BigInt(2000000000),
        } as any),
      },
      transactionHistoryStore: {
        updateTransaction: mockUpdateTransaction,
        addTransaction: mockAddTransaction,
      },
    });

    renderComponent(pendingTransaction, store);

    await userEvent.click(screen.getByText("Speed Up"));
    await waitFor(() => {
      expect(screen.getByText("Speed Up Transaction")).toBeInTheDocument();
    });

    const dialogButtons = screen.getAllByText("Speed Up");
    await userEvent.click(dialogButtons[dialogButtons.length - 1]);

    await waitFor(() => {
      expect(mockUpdateTransaction).toHaveBeenCalledWith(
        pendingTransaction.from,
        pendingTransaction.transactionHash,
        expect.objectContaining({
          pendingStatus: "replaced",
          replacementTransactionHash: "0xnewtx123",
          replacedByAction: "speed-up",
        }),
      );
    });

    expect(mockAddTransaction).toHaveBeenCalled();
  });

  it("should display Dropped status badge", () => {
    renderComponent({
      ...sampleTransaction,
      pendingStatus: "dropped",
    });

    expect(screen.getByText("Dropped")).toBeInTheDocument();
  });
});
