import type { TransactionHistoryEntry } from "@/types/transactionHistory";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReplacementConfirmationDialog from "./ReplacementConfirmationDialog";

vi.mock("@theqrl/web3", () => ({
  utils: {
    fromPlanck: vi.fn<any>(
      (value: number | bigint, _unit: string) => String(Number(value) / 1e18),
    ),
  },
}));

const baseTransaction: TransactionHistoryEntry = {
  id: "0xabc123",
  from: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
  to: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
  amount: 1.0,
  tokenSymbol: "QRL",
  tokenName: "QRL",
  isZrc20Token: false,
  tokenContractAddress: "",
  tokenDecimals: 18,
  transactionHash: "0xabc123",
  blockNumber: "50",
  gasUsed: "21000",
  effectiveGasPrice: "1000000000",
  status: true,
  timestamp: 1700000000000,
  chainId: "0x1",
  pendingStatus: "pending",
  nonce: 5,
  maxFeePerGas: "2000000000",
  maxPriorityFeePerGas: "1000000000",
  gasLimit: 21000,
};

const defaultProps = {
  open: true,
  onOpenChange: vi.fn<(open: boolean) => void>(),
  action: "speed-up" as const,
  originalTransaction: baseTransaction,
  estimatedNewGasFee: "0.000000025",
  isProcessing: false,
  error: "",
  onConfirm: vi.fn(),
};

describe("ReplacementConfirmationDialog", () => {
  afterEach(cleanup);

  // ── Speed-up mode ──

  it("should display speed-up title and description", () => {
    render(<ReplacementConfirmationDialog {...defaultProps} />);

    expect(screen.getByText("Speed Up Transaction")).toBeInTheDocument();
    expect(
      screen.getByText(/re-submit your transaction with a higher gas fee/),
    ).toBeInTheDocument();
  });

  it("should display 'Speed Up' on confirm button", () => {
    render(<ReplacementConfirmationDialog {...defaultProps} />);

    expect(
      screen.getByRole("button", { name: "Speed Up" }),
    ).toBeInTheDocument();
  });

  // ── Cancel mode ──

  it("should display cancel title and description", () => {
    render(
      <ReplacementConfirmationDialog {...defaultProps} action="cancel" />,
    );

    // Title and button both say "Cancel Transaction" — verify at least 2 exist
    expect(screen.getAllByText("Cancel Transaction").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(/self-send transaction.*same nonce/),
    ).toBeInTheDocument();
  });

  it("should display 'Cancel Transaction' on confirm button", () => {
    render(
      <ReplacementConfirmationDialog {...defaultProps} action="cancel" />,
    );

    expect(
      screen.getByRole("button", { name: "Cancel Transaction" }),
    ).toBeInTheDocument();
  });

  // ── Gas fee display ──

  it("should display original gas fee when gasUsed and effectiveGasPrice exist", () => {
    render(<ReplacementConfirmationDialog {...defaultProps} />);

    expect(screen.getByText("Original gas fee")).toBeInTheDocument();
  });

  it("should not display original gas fee when gasUsed is empty", () => {
    render(
      <ReplacementConfirmationDialog
        {...defaultProps}
        originalTransaction={{ ...baseTransaction, gasUsed: "" }}
      />,
    );

    expect(screen.queryByText("Original gas fee")).not.toBeInTheDocument();
  });

  it("should not display original gas fee when effectiveGasPrice is empty", () => {
    render(
      <ReplacementConfirmationDialog
        {...defaultProps}
        originalTransaction={{ ...baseTransaction, effectiveGasPrice: "" }}
      />,
    );

    expect(screen.queryByText("Original gas fee")).not.toBeInTheDocument();
  });

  it("should display estimated new gas fee", () => {
    render(<ReplacementConfirmationDialog {...defaultProps} />);

    expect(screen.getByText("New estimated gas fee")).toBeInTheDocument();
  });

  it("should show 'Estimating...' when estimatedNewGasFee is empty", () => {
    render(
      <ReplacementConfirmationDialog
        {...defaultProps}
        estimatedNewGasFee=""
      />,
    );

    expect(screen.getByText("Estimating...")).toBeInTheDocument();
  });

  // ── Error display ──

  it("should display error message when error is provided", () => {
    render(
      <ReplacementConfirmationDialog
        {...defaultProps}
        error="Insufficient funds for gas"
      />,
    );

    expect(
      screen.getByText("Insufficient funds for gas"),
    ).toBeInTheDocument();
  });

  it("should not display error when error is empty", () => {
    render(<ReplacementConfirmationDialog {...defaultProps} error="" />);

    expect(
      screen.queryByText("Insufficient funds for gas"),
    ).not.toBeInTheDocument();
  });

  // ── Processing state ──

  it("should disable buttons when isProcessing is true", () => {
    render(
      <ReplacementConfirmationDialog {...defaultProps} isProcessing={true} />,
    );

    expect(screen.getByRole("button", { name: /speed up/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Go Back" })).toBeDisabled();
  });

  it("should enable buttons when isProcessing is false", () => {
    render(
      <ReplacementConfirmationDialog
        {...defaultProps}
        isProcessing={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Speed Up" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Go Back" }),
    ).toBeEnabled();
  });

  // ── Callbacks ──

  it("should call onConfirm when confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    render(
      <ReplacementConfirmationDialog
        {...defaultProps}
        onConfirm={onConfirm}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Speed Up" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("should display Go Back button", () => {
    render(<ReplacementConfirmationDialog {...defaultProps} />);

    expect(screen.getByRole("button", { name: "Go Back" })).toBeInTheDocument();
  });

  // ── Closed state ──

  it("should not render content when open is false", () => {
    render(
      <ReplacementConfirmationDialog {...defaultProps} open={false} />,
    );

    expect(
      screen.queryByText("Speed Up Transaction"),
    ).not.toBeInTheDocument();
  });
});
