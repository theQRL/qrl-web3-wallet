import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TokenImportSuccess from "./TokenImportSuccess";

describe("TokenImportSuccess", () => {
  afterEach(cleanup);

  const mockedOnCancelImport = vi.fn();

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <TokenImportSuccess
            contractAddress="Q000000000000000000000000000000000000000000000000000000000db3981cb93db985e4e3a62ff695f7a1b242dd7c00000000000000000000000000000000"
            onCancelImport={mockedOnCancelImport}
            token={{
              balance: 25,
              decimals: BigInt(18),
              name: "MOCK TOKEN",
              symbol: "MCK",
              totalSupply: 100,
              image: "",
            }}
          />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the token import success component", () => {
    renderComponent();

    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "Import token",
    );
    expect(screen.getByText("Contract address")).toBeInTheDocument();
    expect(
      screen.getByText("Q 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 00Db3 981CB 93DB9 85e4e 3a62F f695F 7a1b2 42dd7 C0000 00000 00000 00000 00000 00000 000"),
    ).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("MOCK TOKEN")).toBeInTheDocument();
    expect(screen.getByText("Symbol")).toBeInTheDocument();
    expect(screen.getByText("MCK")).toBeInTheDocument();
    expect(screen.getByText("Total supply")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("Balance")).toBeInTheDocument();
    expect(screen.getByText("25.0 MCK")).toBeInTheDocument();
    expect(screen.getByText("Decimals")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
  });

  it("should render the cancel button in token import success component", async () => {
    renderComponent();

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton).toBeInTheDocument();
    expect(cancelButton).toBeEnabled();
    await userEvent.click(cancelButton);
    expect(mockedOnCancelImport).toHaveBeenCalledTimes(1);
  });

  it("should render the import button in token import success component", async () => {
    renderComponent();

    const importButton = screen.getByRole("button", { name: "Import" });
    expect(importButton).toBeInTheDocument();
    expect(importButton).toBeEnabled();
  });
});
