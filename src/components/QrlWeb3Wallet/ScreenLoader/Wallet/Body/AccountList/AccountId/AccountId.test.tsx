import { mockedStore } from "@/__mocks__/mockedStore";
import { BALANCE_UNAVAILABLE } from "@/stores/qrlStore";
import { StoreProvider } from "@/stores/store";
import i18n from "@/i18n";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import AccountId from "./AccountId";

describe("AccountId", () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage("en");
  });

  const renderComponent = (
    mockedStoreValues = mockedStore(),
    mockedProps: ComponentProps<typeof AccountId> = {
      account: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
    },
  ) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <AccountId {...mockedProps} />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the account id component", () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          getAccountBalance: () => "10.0 QRL",
        },
      }),
    );

    const addressParts = [
      "Q00000",
      "020fB",
      "08fF1",
      "16722",
      "10.0 QRL",
    ];
    for (const word of addressParts) {
      expect(screen.getByText(word)).toBeInTheDocument();
    }
  });

  it.each([
    ["en", "Unavailable"],
    ["de", "Nicht verfügbar"],
    ["es", "No disponible"],
  ])("shows an unavailable balance in %s without a zero fiat value", async (language, message) => {
    await i18n.changeLanguage(language);
    renderComponent(
      mockedStore({
        qrlStore: { getAccountBalance: () => BALANCE_UNAVAILABLE },
        priceStore: { getPrice: () => 2 },
        settingsStore: { showBalanceAndPrice: true, currency: "USD" },
      }),
    );

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });
});
