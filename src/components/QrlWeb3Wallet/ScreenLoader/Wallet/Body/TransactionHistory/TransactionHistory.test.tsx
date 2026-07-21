import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import type { TransactionHistoryEntry } from "@/types/transactionHistory";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TransactionHistory from "./TransactionHistory";

const makeSampleEntry = (
  overrides: Partial<TransactionHistoryEntry> = {},
): TransactionHistoryEntry => ({
  id: "0xtxhash1",
  from: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
  to: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
  amount: 2.5,
  tokenSymbol: "QRL",
  tokenName: "QRL",
  isZrc20Token: false,
  tokenContractAddress: "",
  tokenDecimals: 18,
  transactionHash: "0xtxhash1",
  blockNumber: "100",
  gasUsed: "21000",
  effectiveGasPrice: "1000000000",
  status: true,
  timestamp: 1700000000000,
  chainId: "0x1",
  ...overrides,
});

describe("TransactionHistory", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <TransactionHistory />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the heading and filter tabs", () => {
    renderComponent();

    expect(screen.getByText("Transaction History")).toBeInTheDocument();
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Native")).toBeInTheDocument();
    expect(screen.getByText("ZRC-20")).toBeInTheDocument();
    expect(screen.getByText("NFT")).toBeInTheDocument();
  });

  it("should show empty state when no transactions", () => {
    renderComponent();

    expect(screen.getByText("No transactions yet")).toBeInTheDocument();
  });

  it("should render transaction items grouped by date", () => {
    const entries = [
      makeSampleEntry(),
      makeSampleEntry({
        id: "0xtxhash2",
        transactionHash: "0xtxhash2",
        amount: 5,
        tokenSymbol: "TST",
        isZrc20Token: true,
      }),
    ];

    renderComponent(
      mockedStore({
        transactionHistoryStore: {
          filteredTransactions: entries,
        },
      }),
    );

    expect(screen.getByText("2.5 QRL")).toBeInTheDocument();
    expect(screen.getByText("5 TST")).toBeInTheDocument();
    // Both entries share the same timestamp so they appear under one date header
    const dateHeader = new Date(1700000000000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    expect(screen.getByText(dateHeader)).toBeInTheDocument();
  });

  it("should render separate date headers for different days", () => {
    const day1 = new Date(2026, 1, 17).getTime(); // Feb 17, 2026
    const day2 = new Date(2026, 1, 16).getTime(); // Feb 16, 2026

    const entries = [
      makeSampleEntry({ timestamp: day1 }),
      makeSampleEntry({
        id: "0xtxhash2",
        transactionHash: "0xtxhash2",
        amount: 3,
        timestamp: day2,
      }),
    ];

    renderComponent(
      mockedStore({
        transactionHistoryStore: {
          filteredTransactions: entries,
        },
      }),
    );

    const dateHeader1 = new Date(day1).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const dateHeader2 = new Date(day2).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    expect(screen.getByText(dateHeader1)).toBeInTheDocument();
    expect(screen.getByText(dateHeader2)).toBeInTheDocument();
  });

  it("should call setFilter when tab is clicked", async () => {
    const mockSetFilter = vi.fn<any>();
    renderComponent(
      mockedStore({
        transactionHistoryStore: {
          setFilter: mockSetFilter,
        },
      }),
    );

    await userEvent.click(screen.getByText("Native"));
    expect(mockSetFilter).toHaveBeenCalledWith("native");
  });

  it("should have a back button", () => {
    renderComponent();

    expect(screen.getByTestId("backButtonTestId")).toBeInTheDocument();
  });
});
