import { mockedStore } from "@/__mocks__/mockedStore";
import { TooltipProvider } from "@/components/UI/Tooltip";
import { ROUTES } from "@/router/router";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActiveChain from "./ActiveChain";

vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/ChainConnectivity/ChainIcon/ChainIcon",
  () => ({ default: () => <div>Mocked Chain Icon</div> }),
);

describe("ActiveChain", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <TooltipProvider>
            <ActiveChain />
          </TooltipProvider>
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the active chain component", () => {
    renderComponent();

    expect(screen.getByText("Active chain")).toBeInTheDocument();
    expect(screen.getByText("Mocked Chain Icon")).toBeInTheDocument();
    expect(screen.getByText("QRL Zond Testnet v2")).toBeInTheDocument();
    expect(screen.getByText("Chain ID 1337")).toBeInTheDocument();
    expect(screen.getByText("http://209.250.255.226:8545")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Edit chain" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", ROUTES.ADD_EDIT_CHAIN);
    const editChainButton = screen.getByRole("button", { name: "Edit chain" });
    expect(editChainButton).toBeInTheDocument();
  });
});
