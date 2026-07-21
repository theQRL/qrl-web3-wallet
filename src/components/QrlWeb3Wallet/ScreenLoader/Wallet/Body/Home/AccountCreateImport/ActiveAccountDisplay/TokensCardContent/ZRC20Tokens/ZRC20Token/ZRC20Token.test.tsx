import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/UI/Tooltip";
import ZRC20Token from "./ZRC20Token";

vi.mock("@/utilities/storageUtil", async () => {
  const originalModule = await vi.importActual<
    typeof import("@/utilities/storageUtil")
  >("@/utilities/storageUtil");
  return {
    ...originalModule,
    getTokenContractsList: vi.fn(async () => [
      {
        address: "Q0000000000000000000000000000000000000000000000000000000028c4113a9d3a2e836f28c23ed8e3c1e7c243f56600000000000000000000000000000000",
        image: "testImage1",
      },
      {
        address: "Q00000000000000000000000000000000000000000000000000000000978918b7b544ad491d0b294cc6ac4d7bb0ef711200000000000000000000000000000000",
        image: "testImage2",
      },
      {
        address: "Q000000000000000000000000000000000000000000000000000000000db3981cb93db985e4e3a62ff695f7a1b242dd7c00000000000000000000000000000000",
        image: "testImage3",
      },
    ]),
  };
});
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Home/AccountCreateImport/ActiveAccountDisplay/TokensCardContent/TokenListItemLoading/TokenListItemLoading",
  () => ({ default: () => <div>Mocked Token List Item Loading</div> }),
);
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Home/AccountCreateImport/ActiveAccountDisplay/TokensCardContent/TokenListItem/TokenListItem",
  () => ({ default: () => <div>Mocked Token List Item</div> }),
);

describe("ZRC20Token", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <TooltipProvider>
            <ZRC20Token
              contractAddress="Q000000000000000000000000000000000000000000000000000000000db3981cb93db985e4e3a62ff695f7a1b242dd7c00000000000000000000000000000000"
              tokenImage=""
            />
          </TooltipProvider>
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the zrc 20 token component", async () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          getZrc20TokenDetails: async (_contractAddress: string) => {
            return {
              token: {
                balance: 65,
                decimals: BigInt(18),
                name: "POWERCOIN",
                symbol: "POW",
                totalSupply: 100000,
                image: "",
              },
              error: "",
            };
          },
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Mocked Token List Item")).toBeInTheDocument();
    });
  });
});
