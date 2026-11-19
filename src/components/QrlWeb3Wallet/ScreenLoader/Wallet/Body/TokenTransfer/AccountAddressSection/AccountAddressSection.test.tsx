import { mockedStore } from "@/__mocks__/mockedStore";
import { BALANCE_UNAVAILABLE } from "@/stores/qrlStore";
import { StoreProvider } from "@/stores/store";
import i18n from "@/i18n";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AccountAddressSection from "./AccountAddressSection";

describe("AccountAddressSection", () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage("en");
  });

  const renderComponent = (mockedStoreValues = mockedStore(), tokenBalance?: string) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <AccountAddressSection tokenBalance={tokenBalance} />
        </MemoryRouter>
      </StoreProvider>,
    );

  it.each([
    ["en", "Unavailable"],
    ["de", "Nicht verfügbar"],
    ["es", "No disponible"],
  ])("translates unavailable native and token balances in %s", async (language, message) => {
    await i18n.changeLanguage(language);
    for (const tokenBalance of [undefined, BALANCE_UNAVAILABLE]) {
      renderComponent(mockedStore({
        qrlStore: { getAccountBalance: () => BALANCE_UNAVAILABLE },
      }), tokenBalance);
      expect(screen.getByText(message)).toBeInTheDocument();
      cleanup();
    }
  });

  it("should render the account address section component", () => {
    renderComponent();

    expect(screen.getByText("Account address")).toBeInTheDocument();
    expect(
      screen.getByText("Q 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 08a8e AfB1C F62bF bEb17 41769 DaE1A 9dd47 99619 20000 00000 00000 00000 00000 00000 000"),
    ).toBeInTheDocument();
    expect(screen.getByText("Balance")).toBeInTheDocument();
    expect(screen.getByText("0.0 QRL")).toBeInTheDocument();
  });
});
