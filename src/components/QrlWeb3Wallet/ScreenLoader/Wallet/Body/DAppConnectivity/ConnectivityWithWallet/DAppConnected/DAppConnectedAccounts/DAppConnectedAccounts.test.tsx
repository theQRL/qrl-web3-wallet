import { mockedStore } from "@/__mocks__/mockedStore";
import { TooltipProvider } from "@/components/UI/Tooltip";
import { StoreProvider } from "@/stores/store";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DAppConnectedAccounts from "./DAppConnectedAccounts";

vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/AccountList/AccountId/AccountId",
  () => ({ default: () => <div>Mocked Account ID</div> }),
);

describe("DAppConnectedAccounts", () => {
  const renderComponent = (
    mockedStoreValues = mockedStore({
      dAppRequestStore: {
        currentTabData: {
          connectedAccounts: ["Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000"],
        },
      },
    }),
  ) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <TooltipProvider>
            <DAppConnectedAccounts />
          </TooltipProvider>
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the dapp connected accounts component", async () => {
    renderComponent();

    expect(
      screen.getByText(
        "The following accounts are connected, and can interact with this website.",
      ),
    ).toBeInTheDocument();
    const editButton = screen.getByRole("button", { name: "Edit" });
    expect(editButton).toBeInTheDocument();
    expect(editButton).toBeEnabled();
    expect(screen.getByText("Mocked Account ID")).toBeInTheDocument();
  });
});
