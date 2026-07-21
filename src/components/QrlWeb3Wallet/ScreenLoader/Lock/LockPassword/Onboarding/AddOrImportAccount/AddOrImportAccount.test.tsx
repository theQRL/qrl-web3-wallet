import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { Web3BaseWalletAccount } from "@theqrl/web3";
import userEvent from "@testing-library/user-event";
import AddOrImportAccount from "./AddOrImportAccount";
import { ONBOARDING_STEPS } from "../Onboarding";

vi.mock("@theqrl/web3", () => ({
  default: vi.fn().mockImplementation(() => ({
    qrl: {
      accounts: {
        create: vi.fn().mockReturnValue({
          address: "MockedNewAddress",
          seed: "MockedNewSeed",
        }),
        seedToAccount: vi.fn().mockReturnValue({
          address: "MockedAddress",
          seed: "MockedSeed",
        }),
      },
    },
  })),
  Web3BaseWalletAccount: class {},
}));
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Lock/LockPassword/Onboarding/AddOrImportAccount/AccountAddressDisplay/AccountAddressDisplay",
  () => ({ default: () => <div>Mocked Account Address Display</div> }),
);

describe("AddOrImportAccount", () => {
  afterEach(cleanup);

  const renderComponent = (
    mockedStoreValues = mockedStore(),
    mockedProps: ComponentProps<typeof AddOrImportAccount> = {
      selectStep: () => {},
      addAnAccountToWallet: async (_account: Web3BaseWalletAccount) => {},
    },
  ) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <AddOrImportAccount {...mockedProps} />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the add or import account component", () => {
    renderComponent(
      mockedStore({ qrlStore: { activeAccount: { accountAddress: "" } } }),
    );

    expect(
      screen.getByRole("heading", { level: 3, name: "Add/Import account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "You can either add a new account, or import an existing account using your mnemonic phrases.",
      ),
    ).toBeInTheDocument();
    const addAccountButton = screen.getByRole("button", {
      name: "Create a new account",
    });
    expect(addAccountButton).toBeInTheDocument();
    expect(addAccountButton).toBeEnabled();
    const importAccountButton = screen.getByRole("button", {
      name: "Import an existing account",
    });
    expect(importAccountButton).toBeInTheDocument();
    expect(importAccountButton).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Continue" }),
    ).not.toBeInTheDocument();
  });

  it("should add a new account on clicking the create a new account button", async () => {
    const mockedSelectStep = vi.fn();
    const mockedAddAnAccountToWallet = vi.fn(async () => {});
    renderComponent(
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "",
          },
        },
      }),
      {
        selectStep: mockedSelectStep,
        addAnAccountToWallet: mockedAddAnAccountToWallet,
      },
    );

    const addAccountButton = screen.getByRole("button", {
      name: "Create a new account",
    });
    expect(addAccountButton).toBeInTheDocument();
    expect(addAccountButton).toBeEnabled();
    const continueButton = screen.queryByRole("button", { name: "Continue" });
    expect(continueButton).not.toBeInTheDocument();
    await userEvent.click(addAccountButton);
    expect(mockedAddAnAccountToWallet).toHaveBeenCalledTimes(1);
    expect(mockedAddAnAccountToWallet).toBeCalledWith({
      address: "MockedNewAddress",
      seed: "MockedNewSeed",
    });
  });

  it("should import the account on clicking the import account button", async () => {
    const mockedSelectStep = vi.fn();
    const mockedAddAnAccountToWallet = vi.fn(async () => {});
    renderComponent(
      mockedStore({ qrlStore: { activeAccount: { accountAddress: "" } } }),
      {
        selectStep: mockedSelectStep,
        addAnAccountToWallet: mockedAddAnAccountToWallet,
      },
    );

    const importAccountButton = screen.getByRole("button", {
      name: "Import an existing account",
    });
    expect(importAccountButton).toBeInTheDocument();
    expect(importAccountButton).toBeEnabled();
    const continueButton = screen.queryByRole("button", { name: "Continue" });
    expect(continueButton).not.toBeInTheDocument();
    await userEvent.click(importAccountButton);
    expect(
      screen.getByRole("heading", { level: 2, name: "Import account" }),
    ).toBeInTheDocument();
    const mnemonicPhrasesField = screen.getByRole("textbox", {
      name: "mnemonicPhrases",
    });
    expect(mnemonicPhrasesField).toBeInTheDocument();
    expect(mnemonicPhrasesField).toBeEnabled();
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton).toBeInTheDocument();
    expect(cancelButton).toBeEnabled();
    const importButton = screen.getByRole("button", { name: "Import" });
    expect(importButton).toBeInTheDocument();
    expect(importButton).toBeDisabled();
    await userEvent.type(
      mnemonicPhrasesField,
      "harsh altar congo heater chilly spade buy pore money swiss trendy stable decade bosom ironic maxim slab grill chosen text pouch recent eric text injury cheese trek tsar fish rogue tempo differ",
    );
    await userEvent.click(importButton);
    expect(mockedAddAnAccountToWallet).toHaveBeenCalledTimes(1);
    expect(mockedAddAnAccountToWallet).toBeCalledWith({
      address: "MockedAddress",
      seed: "MockedSeed",
    });
  });

  it("should display the account address if account is available", async () => {
    const mockedSelectStep = vi.fn();
    const mockedAddAnAccountToWallet = vi.fn(async () => {});
    renderComponent(
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q00000000000000000000000000000000000000000000000000000000208318ecd68f26726CE7C54b29CaBA94584969B600000000000000000000000000000000",
          },
        },
      }),
      {
        selectStep: mockedSelectStep,
        addAnAccountToWallet: mockedAddAnAccountToWallet,
      },
    );

    expect(
      screen.getByText("Mocked Account Address Display"),
    ).toBeInTheDocument();
    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeInTheDocument();
    expect(continueButton).toBeEnabled();
    await userEvent.click(continueButton);
    expect(mockedSelectStep).toHaveBeenCalledTimes(1);
    expect(mockedSelectStep).toHaveBeenCalledWith(ONBOARDING_STEPS.COMPLETED);
  });
});
