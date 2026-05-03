import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsAbout from "./SettingsAbout";

describe("SettingsAbout", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <SettingsAbout />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the About heading", () => {
    renderComponent();

    expect(screen.getByText("About")).toBeInTheDocument();
  });

  it("should display wallet info", () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          qrlConnection: {
            isConnected: true,
            isLoading: false,
            blockchain: {
              chainId: "0x1",
              chainName: "QRL Testnet",
            },
          },
          qrlAccounts: {
            isLoading: false,
            accounts: [
              { accountAddress: "Q20B714091cF2a62DADda2847803e3f1B9D2D3779", accountBalance: "0" },
              { accountAddress: "Q20fB08fF1f1376A14C055E9F56df80563E16722b", accountBalance: "0" },
            ],
          },
        },
      }),
    );

    expect(screen.getByText("Version")).toBeInTheDocument();
    expect(screen.getByText("QRL Testnet")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("should display the GitHub Repository link", () => {
    renderComponent();

    expect(screen.getByText("GitHub Repository")).toBeInTheDocument();
  });
});
