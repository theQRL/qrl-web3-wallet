import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/UI/Tooltip";
import userEvent from "@testing-library/user-event";
import { ComponentProps } from "react";
import TokenListItem from "./TokenListItem";

vi.mock("@/utilities/storageUtil", async () => {
  const originalModule = await vi.importActual<
    typeof import("@/utilities/storageUtil")
  >("@/utilities/storageUtil");
  return {
    ...originalModule,
    default: {
      ...originalModule.default,
      clearFromTokenContractsList: vi.fn(async () => {}),
    },
  };
});
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Home/AccountCreateImport/ActiveAccountDisplay/TokensCardContent/TokenListItem/TokenListItemIcon/TokenListItemIcon",
  () => ({ default: () => <div>Mocked Token List Item Icon</div> }),
);

describe("TokenListItem", () => {
  afterEach(cleanup);

  const renderComponent = (
    mockedStoreValues = mockedStore(),
    mockedProps: ComponentProps<typeof TokenListItem> = {
      balance: "25 QRL",
      name: "QRL TOKEN",
      symbol: "QRL",
      contractAddress: "Q000000000000000000000000000000000000000000000000000000000db3981cb93db985e4e3a62ff695f7a1b242dd7c00000000000000000000000000000000",
      decimals: 18,
      isZrc20Token: false,
      image: "",
    },
  ) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <TooltipProvider>
            <TokenListItem {...mockedProps} />
          </TooltipProvider>
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the token list item component", () => {
    renderComponent();

    expect(screen.getByText("25 QRL")).toBeInTheDocument();
    expect(screen.getByText("QRL TOKEN")).toBeInTheDocument();
    const moreButton = screen.getByRole("button", { name: "More" });
    expect(moreButton).toBeInTheDocument();
    expect(moreButton).toBeEnabled();
  });

  it("should disable the hide token button if the token is not ZRC 20", async () => {
    renderComponent(mockedStore(), {
      isZrc20Token: false,
      image: "",
      balance: "",
      name: "",
      symbol: "",
    });

    const moreButton = screen.getByRole("button", { name: "More" });
    expect(moreButton).toBeInTheDocument();
    expect(moreButton).toBeEnabled();
    await userEvent.click(moreButton);
    const hideButton = screen.getByRole("button", { name: "Hide Token" });
    expect(hideButton).toBeInTheDocument();
    expect(hideButton).toBeDisabled();
  });

  it("should hide the token on clicking the hide token button", async () => {
    const mockedTriggerReRender = vi.fn(() => {});
    renderComponent(mockedStore(), {
      isZrc20Token: true,
      image: "",
      balance: "",
      name: "",
      symbol: "TST",
      triggerReRender: mockedTriggerReRender,
    });

    const moreButton = screen.getByRole("button", { name: "More" });
    expect(moreButton).toBeInTheDocument();
    expect(moreButton).toBeEnabled();
    await userEvent.click(moreButton);
    const hideButton = screen.getByRole("button", { name: "Hide Token" });
    expect(hideButton).toBeInTheDocument();
    expect(hideButton).toBeEnabled();
    await userEvent.click(hideButton);
    expect(screen.getByText("Hide")).toBeInTheDocument();
    expect(
      screen.getByText("Do you want to hide 'TST' from wallet?"),
    ).toBeInTheDocument();
    const noButton = screen.getByRole("button", { name: "Cancel Hide" });
    expect(noButton).toBeInTheDocument();
    expect(noButton).toBeEnabled();
    const yesButton = screen.getByRole("button", { name: "Confirm Hide" });
    expect(yesButton).toBeInTheDocument();
    expect(yesButton).toBeEnabled();
    await userEvent.click(yesButton);
    expect(mockedTriggerReRender).toHaveBeenCalledTimes(1);
  });
});
