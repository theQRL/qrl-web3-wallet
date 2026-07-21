import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/UI/Tooltip";
import ActiveAccount from "./ActiveAccount";

vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/AccountList/AccountId/AccountId",
  () => ({ default: () => <div>Mocked Account Id</div> }),
);

describe("ActiveAccount", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <TooltipProvider>
            <ActiveAccount />
          </TooltipProvider>
        </MemoryRouter>
      </StoreProvider>,
    );

  const openMenu = async () => {
    const trigger = screen.getByTestId("account-menu");
    await userEvent.click(trigger);
  };

  it("should render the active account component", async () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
          },
        },
      }),
    );

    expect(screen.getByText("Active account")).toBeInTheDocument();
    expect(screen.getByText("Mocked Account Id")).toBeInTheDocument();

    await openMenu();
    expect(
      screen.getByRole("menuitem", { name: "Send Quanta" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Copy Address" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Rename" }),
    ).toBeInTheDocument();
  });

  it("should call the copyAccount function on clicking the copy button", async () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
          },
        },
      }),
    );

    const mockedWriteText = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: mockedWriteText,
      },
      writable: true,
    });

    await openMenu();
    const copyItem = screen.getByRole("menuitem", { name: "Copy Address" });
    await userEvent.click(copyItem);
    expect(mockedWriteText).toBeCalledTimes(1);
    expect(mockedWriteText).toBeCalledWith(
      "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
    );
  });

  it("should show edit input when rename is clicked", async () => {
    const labels: Record<string, string> = {
      Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000: "My Main Wallet",
    };
    renderComponent(
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
          },
        },
        accountLabelsStore: {
          labels,
          getLabel: (addr: string) => labels[addr] ?? "",
        },
      }),
    );

    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Rename" }),
    );

    const input = screen.getByRole("textbox", { name: "Edit account label" });
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("My Main Wallet");
    expect(
      screen.getByRole("button", { name: "Save label" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel edit" }),
    ).toBeInTheDocument();
  });

  it("should call setLabel on save", async () => {
    const setLabel = vi.fn<any>(() => Promise.resolve());
    const labels: Record<string, string> = {
      Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000: "Old Name",
    };
    renderComponent(
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
          },
        },
        accountLabelsStore: {
          labels,
          getLabel: (addr: string) => labels[addr] ?? "",
          setLabel,
        },
      }),
    );

    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Rename" }),
    );

    const input = screen.getByRole("textbox", { name: "Edit account label" });
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");

    await userEvent.click(
      screen.getByRole("button", { name: "Save label" }),
    );

    expect(setLabel).toHaveBeenCalledWith(
      "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
      "New Name",
    );
  });

  it("should hide edit input on cancel", async () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
          },
        },
      }),
    );

    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Rename" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Edit account label" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Cancel edit" }),
    );

    expect(
      screen.queryByRole("textbox", { name: "Edit account label" }),
    ).not.toBeInTheDocument();
  });

  it("should save on Enter key", async () => {
    const setLabel = vi.fn<any>(() => Promise.resolve());
    const labels: Record<string, string> = {
      Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000: "Old Name",
    };
    renderComponent(
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
          },
        },
        accountLabelsStore: {
          labels,
          getLabel: (addr: string) => labels[addr] ?? "",
          setLabel,
        },
      }),
    );

    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Rename" }),
    );

    const input = screen.getByRole("textbox", { name: "Edit account label" });
    await userEvent.clear(input);
    await userEvent.type(input, "Enter Name{Enter}");

    await waitFor(() => {
      expect(setLabel).toHaveBeenCalledWith(
        "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
        "Enter Name",
      );
    });
  });

  it("should cancel on Escape key", async () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
          },
        },
      }),
    );

    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Rename" }),
    );

    const input = screen.getByRole("textbox", { name: "Edit account label" });
    await userEvent.type(input, "{Escape}");

    expect(
      screen.queryByRole("textbox", { name: "Edit account label" }),
    ).not.toBeInTheDocument();
  });

  it("should show Hide menu item when other visible accounts exist", async () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
          },
          qrlAccounts: {
            isLoading: false,
            accounts: [
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
                accountBalance: "1.0 QRL",
              },
              {
                accountAddress: "Q00000000000000000000000000000000000000000000000000000000205046e6A6E159eD6ACedE46A36CAD6D449C80A100000000000000000000000000000000",
                accountBalance: "2.0 QRL",
              },
            ],
          },
        },
      }),
    );

    await openMenu();
    expect(
      screen.getByRole("menuitem", { name: "Hide" }),
    ).toBeInTheDocument();
  });

  it("should not show Hide when it is the only visible account", async () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
          },
          qrlAccounts: {
            isLoading: false,
            accounts: [
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
                accountBalance: "1.0 QRL",
              },
            ],
          },
        },
      }),
    );

    await openMenu();
    expect(
      screen.queryByRole("menuitem", { name: "Hide" }),
    ).not.toBeInTheDocument();
  });

  it("should call hideAccount and setActiveAccount when Hide is clicked", async () => {
    const hideAccount = vi.fn<any>(() => Promise.resolve());
    const setActiveAccount = vi.fn<any>(() => Promise.resolve());
    renderComponent(
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
          },
          qrlAccounts: {
            isLoading: false,
            accounts: [
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
                accountBalance: "1.0 QRL",
              },
              {
                accountAddress: "Q00000000000000000000000000000000000000000000000000000000205046e6A6E159eD6ACedE46A36CAD6D449C80A100000000000000000000000000000000",
                accountBalance: "2.0 QRL",
              },
            ],
          },
          setActiveAccount,
        },
        hiddenAccountsStore: {
          hiddenAccounts: {},
          hiddenAddresses: [],
          loadHiddenAccounts: async () => {},
          hideAccount,
          unhideAccount: async () => {},
          isHidden: () => false,
        },
      }),
    );

    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Hide" }),
    );

    expect(hideAccount).toHaveBeenCalledWith(
      "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
    );
    expect(setActiveAccount).toHaveBeenCalledWith(
      "Q00000000000000000000000000000000000000000000000000000000205046e6A6E159eD6ACedE46A36CAD6D449C80A100000000000000000000000000000000",
    );
  });
});
