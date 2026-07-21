import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/UI/Tooltip";
import DAppConnected from "./DAppConnected";

describe("DAppConnected", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <TooltipProvider>
            <DAppConnected />
          </TooltipProvider>
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the dapp connected component", () => {
    renderComponent(
      mockedStore({
        qrlStore: { qrlAccounts: { isLoading: false } },
        dAppRequestStore: {
          currentTabData: {
            connectedAccounts: ["Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000"],
          },
        },
      }),
    );

    expect(
      screen.getByText(
        "The following accounts are connected, and can interact with this website.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Q00000")).toBeInTheDocument();
    expect(screen.getByText("020fB")).toBeInTheDocument();
    expect(screen.getByText("08fF1")).toBeInTheDocument();
    expect(screen.getByText("f1376")).toBeInTheDocument();
    expect(screen.getByText("A14C0")).toBeInTheDocument();
    expect(screen.getByText("55E9F")).toBeInTheDocument();
    expect(screen.getByText("56df8")).toBeInTheDocument();
    expect(screen.getByText("0563E")).toBeInTheDocument();
    expect(screen.getByText("16722")).toBeInTheDocument();
    expect(screen.getByText("0.0 QRL")).toBeInTheDocument();
  });
});
