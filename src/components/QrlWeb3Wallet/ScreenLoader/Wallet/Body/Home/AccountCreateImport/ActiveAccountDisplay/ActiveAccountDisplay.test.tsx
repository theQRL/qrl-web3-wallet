import { mockedStore } from "@/__mocks__/mockedStore";
import { BALANCE_UNAVAILABLE } from "@/stores/qrlStore";
import { StoreProvider } from "@/stores/store";
import i18n from "@/i18n";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActiveAccountDisplay from "./ActiveAccountDisplay";

describe("ActiveAccountDisplay", () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage("en");
  });

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <ActiveAccountDisplay />
        </MemoryRouter>
      </StoreProvider>,
    );

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

  it("should render the active account details", () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q00000000000000000000000000000000000000000000000000000000205046e6A6E159eD6ACedE46A36CAD6D449C80A100000000000000000000000000000000",
          },
          getAccountBalance: (_accountAddress: string) => {
            return "2.45 QRL";
          },
        },
      }),
    );

    expect(screen.getByText("2.45 QRL")).toBeInTheDocument();
    expect(
      screen.getByText("Q 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 02050 46e6A 6E159 eD6AC edE46 A36CA D6D44 9C80A 10000 00000 00000 00000 00000 00000 000"),
    ).toBeInTheDocument();
  });
});
