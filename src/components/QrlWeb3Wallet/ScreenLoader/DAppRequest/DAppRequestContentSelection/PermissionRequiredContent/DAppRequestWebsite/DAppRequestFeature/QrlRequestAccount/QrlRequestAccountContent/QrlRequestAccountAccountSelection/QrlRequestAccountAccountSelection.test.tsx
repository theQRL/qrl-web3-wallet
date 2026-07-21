import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import QrlRequestAccountAccountSelection from "./QrlRequestAccountAccountSelection";

vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/AccountList/AccountId/AccountId",
  () => ({ default: () => <div>Mocked Account ID</div> }),
);

describe("QrlRequestAccountAccountSelection", () => {
  afterEach(cleanup);

  const renderComponent = (
    mockedStoreValues = mockedStore(),
    mockedProps: ComponentProps<typeof QrlRequestAccountAccountSelection> = {
      onAccountSelection: () => {},
      selectedAccounts: [],
    },
  ) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <QrlRequestAccountAccountSelection {...mockedProps} />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the qrl request account account selection component", async () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          qrlAccounts: {
            isLoading: false,
            accounts: [
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020E7Bde67f00EA38ABb2aC57e1B0DD93f518446c00000000000000000000000000000000",
                accountBalance: "0.0 QRL",
              },
            ],
          },
        },
      }),
    );

    expect(
      screen.getByText(
        "Select the accounts you want this site to connect with",
      ),
    ).toBeInTheDocument();
    const checkBox = screen.getByRole("checkbox", {
      name: "accountsCheckbox",
    });
    expect(checkBox).toBeInTheDocument();
    expect(checkBox).toBeEnabled();
    expect(screen.getByText("Mocked Account ID")).toBeInTheDocument();
  });

  it("should display the message is no accounts are available", async () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          qrlAccounts: {
            isLoading: false,
            accounts: [],
          },
        },
      }),
    );

    expect(
      screen.getByText("No accounts available to connect"),
    ).toBeInTheDocument();
  });

  it("should call the account selection callback on clicking checkbox", async () => {
    const mockedOnAccountSelection = vi.fn(() => {});
    renderComponent(
      mockedStore({
        qrlStore: {
          qrlAccounts: {
            isLoading: false,
            accounts: [
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020E7Bde67f00EA38ABb2aC57e1B0DD93f518446c00000000000000000000000000000000",
                accountBalance: "0.0 QRL",
              },
            ],
          },
        },
      }),
      { selectedAccounts: [], onAccountSelection: mockedOnAccountSelection },
    );

    const checkBox = screen.getByRole("checkbox", {
      name: "accountsCheckbox",
    });
    expect(checkBox).toBeInTheDocument();
    expect(checkBox).toBeEnabled();
    await userEvent.click(checkBox);
    expect(mockedOnAccountSelection).toHaveBeenCalledTimes(1);
  });
});
