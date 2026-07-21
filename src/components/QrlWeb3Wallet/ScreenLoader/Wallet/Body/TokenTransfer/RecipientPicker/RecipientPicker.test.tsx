import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import RecipientPicker from "./RecipientPicker";

const { localStore } = vi.hoisted(() => {
  const localStore: Record<string, any> = {};
  return { localStore };
});
vi.mock("webextension-polyfill", () => ({
  __esModule: true,
  default: {
    storage: {
      local: {
        get: vi.fn((key: string) =>
          Promise.resolve(key in localStore ? { [key]: localStore[key] } : {}),
        ),
        set: vi.fn((data: Record<string, any>) => {
          Object.assign(localStore, data);
          return Promise.resolve();
        }),
        remove: vi.fn((key: string) => {
          delete localStore[key];
          return Promise.resolve();
        }),
        clear: vi.fn(() => {
          for (const k of Object.keys(localStore)) delete localStore[k];
          return Promise.resolve();
        }),
      },
      session: {
        get: vi.fn(() => Promise.resolve({})),
        set: vi.fn(() => Promise.resolve()),
      },
    },
  },
}));

describe("RecipientPicker", () => {
  beforeEach(() => {
    for (const k of Object.keys(localStore)) delete localStore[k];
  });
  afterEach(cleanup);

  const renderComponent = (
    onSelect = vi.fn<any>(),
    mockedStoreValues = mockedStore(),
  ) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <RecipientPicker
            open={true}
            onOpenChange={vi.fn()}
            onSelect={onSelect}
          />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the dialog title", () => {
    renderComponent();

    expect(screen.getByText("Select Recipient")).toBeInTheDocument();
  });

  it("should render three tabs", () => {
    renderComponent();

    expect(screen.getByText("My Accounts")).toBeInTheDocument();
    expect(screen.getByText("Contacts")).toBeInTheDocument();
    expect(screen.getByText("Recent")).toBeInTheDocument();
  });

  it("should show 'No other accounts' when only active account exists", () => {
    renderComponent();

    expect(screen.getByText("No other accounts")).toBeInTheDocument();
  });

  it("should list other accounts excluding active", () => {
    const labels: Record<string, string> = {
      Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: "Account 1",
      Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000: "Account 2",
    };
    renderComponent(
      vi.fn(),
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
          },
          qrlAccounts: {
            accounts: [
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
                accountBalance: "10",
              },
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
                accountBalance: "5",
              },
            ],
          },
        },
        accountLabelsStore: {
          labels,
          getLabel: (addr: string) => labels[addr] ?? "",
        },
      }),
    );

    expect(screen.getByText("Account 2")).toBeInTheDocument();
    expect(
      screen.getByText(/Q00000.*020fB.*16722 b/),
    ).toBeInTheDocument();
  });

  it("should label Ledger accounts as 'Ledger' with index", () => {
    const labels: Record<string, string> = {
      Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: "Account 1",
      Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000: "Account 2",
      Q0000000000000000000000000000000000000000000000000000000030aA00aA0a0000A00A000A0A00aa00000A00000c00000000000000000000000000000000: "Ledger 1",
    };
    renderComponent(
      vi.fn(),
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
          },
          qrlAccounts: {
            accounts: [
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
                accountBalance: "10",
              },
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
                accountBalance: "5",
              },
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000030aA00aA0a0000A00A000A0A00aa00000A00000c00000000000000000000000000000000",
                accountBalance: "3",
              },
            ],
          },
        },
        accountLabelsStore: {
          labels,
          getLabel: (addr: string) => labels[addr] ?? "",
        },
      }),
    );

    expect(screen.getByText("Account 2")).toBeInTheDocument();
    expect(screen.getByText("Ledger 1")).toBeInTheDocument();
  });

  it("should show address as fallback when no label exists", () => {
    renderComponent(
      vi.fn(),
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
          },
          qrlAccounts: {
            accounts: [
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
                accountBalance: "10",
              },
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
                accountBalance: "5",
              },
            ],
          },
        },
      }),
    );

    // With no labels from store, address is shown as both label and address line
    const matches = screen.getAllByText(
      /Q00000.*020fB.*16722 b/,
    );
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("should show 'No contacts saved' on contacts tab", async () => {
    renderComponent();

    await userEvent.click(screen.getByText("Contacts"));

    expect(screen.getByText("No contacts saved")).toBeInTheDocument();
  });

  it("should show contacts on contacts tab", async () => {
    renderComponent(
      vi.fn(),
      mockedStore({
        contactsStore: {
          contacts: [
            {
              name: "Alice",
              address: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
            },
          ],
        },
      }),
    );

    await userEvent.click(screen.getByText("Contacts"));

    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("should show 'No recent transactions' on recent tab", async () => {
    renderComponent();

    await userEvent.click(screen.getByText("Recent"));

    expect(screen.getByText("No recent transactions")).toBeInTheDocument();
  });

  it("should show recent addresses on recent tab", async () => {
    renderComponent(
      vi.fn(),
      mockedStore({
        transactionHistoryStore: {
          transactions: [
            {
              id: "0x1",
              from: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
              to: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
              amount: 1,
              tokenSymbol: "QRL",
              tokenName: "QRL",
              isZrc20Token: false,
              tokenContractAddress: "",
              tokenDecimals: 18,
              transactionHash: "0x1",
              blockNumber: "1",
              gasUsed: "21000",
              effectiveGasPrice: "1000000000",
              status: true,
              timestamp: Date.now(),
              chainId: "0x1",
            },
          ],
        },
      }),
    );

    await userEvent.click(screen.getByText("Recent"));

    expect(
      screen.getByText(/Q00000.*020fB.*16722 b/),
    ).toBeInTheDocument();
  });

  it("should call onSelect when an address is clicked", async () => {
    const onSelect = vi.fn<any>();
    const labels: Record<string, string> = {
      Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000: "Account 1",
      Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000: "Account 2",
    };
    renderComponent(
      onSelect,
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
          },
          qrlAccounts: {
            accounts: [
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
                accountBalance: "10",
              },
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
                accountBalance: "5",
              },
            ],
          },
        },
        accountLabelsStore: {
          labels,
          getLabel: (addr: string) => labels[addr] ?? "",
        },
      }),
    );

    expect(screen.getByText("Account 2")).toBeInTheDocument();

    const addressButton = screen.getByText(
      /Q00000.*020fB.*16722 b/,
    );
    await userEvent.click(addressButton.closest("button")!);

    expect(onSelect).toHaveBeenCalledWith(
      "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
    );
  });

  it("should call onSelect when a contact is clicked", async () => {
    const onSelect = vi.fn<any>();
    renderComponent(
      onSelect,
      mockedStore({
        contactsStore: {
          contacts: [
            {
              name: "Alice",
              address: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
            },
          ],
        },
      }),
    );

    await userEvent.click(screen.getByText("Contacts"));
    const contactButton = screen.getByText("Alice").closest("button")!;
    await userEvent.click(contactButton);

    expect(onSelect).toHaveBeenCalledWith(
      "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
    );
  });

  it("should call onSelect when a recent address is clicked", async () => {
    const onSelect = vi.fn<any>();
    renderComponent(
      onSelect,
      mockedStore({
        transactionHistoryStore: {
          transactions: [
            {
              id: "0x1",
              from: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
              to: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
              amount: 1,
              tokenSymbol: "QRL",
              tokenName: "QRL",
              isZrc20Token: false,
              tokenContractAddress: "",
              tokenDecimals: 18,
              transactionHash: "0x1",
              blockNumber: "1",
              gasUsed: "21000",
              effectiveGasPrice: "1000000000",
              status: true,
              timestamp: Date.now(),
              chainId: "0x1",
            },
          ],
        },
      }),
    );

    await userEvent.click(screen.getByText("Recent"));
    const recentButton = screen
      .getByText(/Q00000.*020fB.*16722 b/)
      .closest("button")!;
    await userEvent.click(recentButton);

    expect(onSelect).toHaveBeenCalledWith(
      "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
    );
  });

  it("should render address book trigger button", () => {
    render(
      <StoreProvider value={mockedStore()}>
        <MemoryRouter>
          <RecipientPicker
            open={false}
            onOpenChange={vi.fn()}
            onSelect={vi.fn()}
          />
        </MemoryRouter>
      </StoreProvider>,
    );

    expect(screen.getByLabelText("Open address book")).toBeInTheDocument();
  });
});
