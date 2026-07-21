import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AccountList from "./AccountList";

vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/AccountList/NewAccount/NewAccount",
  () => ({ default: () => <div>Mocked New Account</div> }),
);
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/AccountList/ActiveAccount/ActiveAccount",
  () => ({ default: () => <div>Mocked Active Account</div> }),
);
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/AccountList/OtherAccounts/OtherAccounts",
  () => ({ default: () => <div>Mocked Other Account</div> }),
);
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/AccountList/AccountId/AccountId",
  () => ({
    default: ({ account }: { account: string }) => (
      <div>Mocked AccountId {account}</div>
    ),
  }),
);

describe("AccountList", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <AccountList />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the account list component", () => {
    renderComponent();

    expect(screen.getByText("Mocked New Account")).toBeInTheDocument();
    expect(screen.getByText("Mocked Active Account")).toBeInTheDocument();
    expect(screen.getByText("Mocked Other Account")).toBeInTheDocument();
  });

  it("should not show hidden accounts section when no accounts are hidden", () => {
    renderComponent();

    expect(screen.queryByText(/Hidden accounts/)).not.toBeInTheDocument();
  });

  it("should show hidden accounts section when accounts are hidden", () => {
    const hidden: Record<string, boolean> = {
      Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000: true,
    };
    renderComponent(
      mockedStore({
        qrlStore: {
          qrlAccounts: {
            isLoading: false,
            accounts: [
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
                accountBalance: "1.0 QRL",
              },
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
                accountBalance: "2.0 QRL",
              },
            ],
          },
        },
        hiddenAccountsStore: {
          hiddenAccounts: hidden,
          hiddenAddresses: ["Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000"],
          loadHiddenAccounts: async () => {},
          hideAccount: async () => {},
          unhideAccount: async () => {},
          isHidden: (addr: string) => !!hidden[addr],
        },
      }),
    );

    expect(screen.getByText("Hidden accounts (1)")).toBeInTheDocument();
  });

  it("should expand hidden accounts section on click", async () => {
    const hidden: Record<string, boolean> = {
      Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000: true,
    };
    renderComponent(
      mockedStore({
        qrlStore: {
          qrlAccounts: {
            isLoading: false,
            accounts: [
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
                accountBalance: "1.0 QRL",
              },
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
                accountBalance: "2.0 QRL",
              },
            ],
          },
        },
        hiddenAccountsStore: {
          hiddenAccounts: hidden,
          hiddenAddresses: ["Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000"],
          loadHiddenAccounts: async () => {},
          hideAccount: async () => {},
          unhideAccount: async () => {},
          isHidden: (addr: string) => !!hidden[addr],
        },
      }),
    );

    await userEvent.click(screen.getByText("Hidden accounts (1)"));

    expect(
      screen.getByText(
        "Mocked AccountId Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
      ),
    ).toBeInTheDocument();
  });

  it("should call unhideAccount when unhide button is clicked", async () => {
    const unhideAccount = vi.fn<any>(() => Promise.resolve());
    const hidden: Record<string, boolean> = {
      Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000: true,
    };
    renderComponent(
      mockedStore({
        qrlStore: {
          qrlAccounts: {
            isLoading: false,
            accounts: [
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
                accountBalance: "1.0 QRL",
              },
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
                accountBalance: "2.0 QRL",
              },
            ],
          },
        },
        hiddenAccountsStore: {
          hiddenAccounts: hidden,
          hiddenAddresses: ["Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000"],
          loadHiddenAccounts: async () => {},
          hideAccount: async () => {},
          unhideAccount,
          isHidden: (addr: string) => !!hidden[addr],
        },
      }),
    );

    await userEvent.click(screen.getByText("Hidden accounts (1)"));
    await userEvent.click(screen.getByRole("button", { name: "Unhide" }));

    expect(unhideAccount).toHaveBeenCalledWith(
      "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
    );
  });
});
