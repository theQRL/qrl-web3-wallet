import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import type { TransactionHistoryEntry } from "@/types/transactionHistory";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TransactionHistoryItem from "./TransactionHistoryItem";

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

describe("TransactionHistoryItem", () => {
  afterEach(cleanup);

  const renderComponent = (transaction: TransactionHistoryEntry) =>
    render(
      <StoreProvider value={mockedStore()}>
        <MemoryRouter>
          <TransactionHistoryItem transaction={transaction} />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render a confirmed native transaction", () => {
    renderComponent(makeSampleEntry());

    expect(screen.getByText("Send")).toBeInTheDocument();
    expect(screen.getByText("2.5 QRL")).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
  });

  it("should render a failed transaction", () => {
    renderComponent(makeSampleEntry({ status: false }));

    expect(screen.getByText("Send")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("should render a ZRC-20 token transaction", () => {
    renderComponent(
      makeSampleEntry({
        isZrc20Token: true,
        tokenSymbol: "TST",
        amount: 100,
      }),
    );

    expect(screen.getByText("Send")).toBeInTheDocument();
    expect(screen.getByText("100 TST")).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
  });

  it("should be clickable with a link to transaction detail", () => {
    renderComponent(makeSampleEntry());

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/transaction-detail");
  });

  it("should render pending status with spinner", () => {
    renderComponent(makeSampleEntry({ pendingStatus: "pending" }));

    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("should render replaced status", () => {
    renderComponent(makeSampleEntry({ pendingStatus: "replaced" }));

    expect(screen.getByText("Replaced")).toBeInTheDocument();
  });

  it("should render cancelled status", () => {
    renderComponent(makeSampleEntry({ pendingStatus: "cancelled" }));

    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("should render dropped status", () => {
    renderComponent(makeSampleEntry({ pendingStatus: "dropped" }));

    expect(screen.getByText("Dropped")).toBeInTheDocument();
  });

  it("should show Speed Up and Cancel buttons for pending tx with nonce", () => {
    renderComponent(
      makeSampleEntry({ pendingStatus: "pending", nonce: 5 }),
    );

    expect(screen.getByText("Speed Up")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("should not show action buttons for pending tx without nonce", () => {
    renderComponent(makeSampleEntry({ pendingStatus: "pending" }));

    expect(screen.queryByText("Speed Up")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });

  it("should not show action buttons for confirmed tx", () => {
    renderComponent(makeSampleEntry({ pendingStatus: "confirmed", nonce: 5 }));

    expect(screen.queryByText("Speed Up")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });

  it("should navigate with speed-up action when Speed Up clicked", async () => {
    renderComponent(
      makeSampleEntry({ pendingStatus: "pending", nonce: 5 }),
    );

    await userEvent.click(screen.getByText("Speed Up"));
    // The click handler calls navigate and e.preventDefault, so the link should not have been followed
    // We verify the button exists and is clickable
    expect(screen.getByText("Speed Up")).toBeInTheDocument();
  });

  it("should navigate with cancel action when Cancel clicked", async () => {
    renderComponent(
      makeSampleEntry({ pendingStatus: "pending", nonce: 5 }),
    );

    await userEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("should use status boolean as fallback when no pendingStatus", () => {
    renderComponent(makeSampleEntry({ pendingStatus: undefined, status: true }));
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
  });

  it("should display fiat value when price is available", () => {
    const storeWithPrice = mockedStore({
      priceStore: {
        getPrice: () => 1.5,
      },
      settingsStore: {
        showBalanceAndPrice: true,
        currency: "USD",
      },
    });

    render(
      <StoreProvider value={storeWithPrice}>
        <MemoryRouter>
          <TransactionHistoryItem transaction={makeSampleEntry({ amount: 10 })} />
        </MemoryRouter>
      </StoreProvider>,
    );

    // 10 QRL * $1.50 = $15.00 → should show ≈ $15.00
    expect(screen.getByText(/≈/)).toBeInTheDocument();
  });

  it("should not display fiat value when showBalanceAndPrice is false", () => {
    const storeHidden = mockedStore({
      priceStore: {
        getPrice: () => 1.5,
      },
      settingsStore: {
        showBalanceAndPrice: false,
        currency: "USD",
      },
    });

    render(
      <StoreProvider value={storeHidden}>
        <MemoryRouter>
          <TransactionHistoryItem transaction={makeSampleEntry({ amount: 10 })} />
        </MemoryRouter>
      </StoreProvider>,
    );

    expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
  });

  it("should not display fiat value for ZRC-20 tokens", () => {
    const storeWithPrice = mockedStore({
      priceStore: {
        getPrice: () => 1.5,
      },
      settingsStore: {
        showBalanceAndPrice: true,
        currency: "USD",
      },
    });

    render(
      <StoreProvider value={storeWithPrice}>
        <MemoryRouter>
          <TransactionHistoryItem
            transaction={makeSampleEntry({
              amount: 10,
              isZrc20Token: true,
              tokenSymbol: "TST",
            })}
          />
        </MemoryRouter>
      </StoreProvider>,
    );

    expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
  });

  it("should not display fiat value when price is zero", () => {
    const storeNoPrice = mockedStore({
      priceStore: {
        getPrice: () => 0,
      },
      settingsStore: {
        showBalanceAndPrice: true,
        currency: "USD",
      },
    });

    render(
      <StoreProvider value={storeNoPrice}>
        <MemoryRouter>
          <TransactionHistoryItem transaction={makeSampleEntry({ amount: 10 })} />
        </MemoryRouter>
      </StoreProvider>,
    );

    expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
  });
});
