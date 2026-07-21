import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WatchAssetVerification from "./WatchAssetVerification";

vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/DAppRequest/DAppRequestContentSelection/AddQrlChainContent/AddQrlChainInfo/AddQrlChainDetails/CurrencyImagePreload/CurrencyImagePreload",
  () => ({ default: () => <div>Mocked Currency Image Preload</div> }),
);

describe("WatchAssetVerification", () => {
  afterEach(cleanup);

  const renderComponent = (
    mockedStoreValues = mockedStore({
      dAppRequestStore: {
        dAppRequestData: {
          params: [
            {
              options: {
                address: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
                symbol: "TST",
                image: "testImage",
                decimals: 18,
              },
            },
          ],
        },
      },
      qrlStore: {
        getZrc20TokenDetails: async () => ({
          token: {
            balance: 2,
            decimals: 18n,
            image: "testImage",
            name: "Test Name",
            symbol: "TST",
            totalSupply: 100,
          },
          error: "",
        }),
      },
    }),
  ) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <WatchAssetVerification />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the watch asset verification component when there are no mismatch", async () => {
    renderComponent();

    expect(screen.getByText("Verifying token details...")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText(
          "Ensure you understand what you are doing before adding the token.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("should render the watch asset verification component when there is a mismatch", async () => {
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: {
            params: [
              {
                options: {
                  address: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
                  symbol: "TST",
                  image: "testImage",
                  decimals: 18,
                },
              },
            ],
          },
        },
        qrlStore: {
          getZrc20TokenDetails: async () => ({
            token: {
              balance: 2,
              decimals: 18n,
              image: "testImage",
              name: "Test Name",
              symbol: "NOMATCH",
              totalSupply: 100,
            },
            error: "",
          }),
        },
      }),
    );

    expect(screen.getByText("Verifying token details...")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText(
          "The token symbol did not match. Expected 'NOMATCH', but received 'TST'",
        ),
      ).toBeInTheDocument();
    });
  });
});
