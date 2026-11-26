import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import AddQrlChainContent from "./AddQrlChainContent";

vi.mock("@/utilities/storageUtil", () => ({
  __esModule: true,
  default: {
    setAllBlockChains: vi.fn(async () => {}),
    clearDAppsRequestData: vi.fn(async () => {}),
  },
}));

vi.mock("@/scripts/utils/restrictedMethodsMiddlewareUtils", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/scripts/utils/restrictedMethodsMiddlewareUtils")
  >()),
  includeChainForUrlOrigin: vi.fn(async () => {}),
}));

vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/DAppRequest/DAppRequestContentSelection/AddQrlChainContent/AddQrlChainInfo/AddQrlChainInfo",
  () => ({ default: () => <div>Mocked Add Qrl Chain Info</div> }),
);

describe("AddQrlChainContent", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <AddQrlChainContent />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the add qrl chain content component", () => {
    renderComponent();

    expect(screen.getByText("Add new chain")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Here is a request to add the following blockchain to the wallet.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Mocked Add Qrl Chain Info")).toBeInTheDocument();
    expect(
      screen.getByText("Do you want to add this chain?"),
    ).toBeInTheDocument();
    const noButton = screen.getByRole("button", { name: "No" });
    expect(noButton).toBeInTheDocument();
    expect(noButton).toBeEnabled();
    const yesButton = screen.getByRole("button", { name: "Yes" });
    expect(yesButton).toBeInTheDocument();
    expect(yesButton).toBeEnabled();
  });

  it("should call onPermission with false if request is rejected", async () => {
    const mockedOnPermission = vi.fn(async () => {});
    renderComponent(
      mockedStore({ dAppRequestStore: { onPermission: mockedOnPermission } }),
    );

    const noButton = screen.getByRole("button", { name: "No" });
    expect(noButton).toBeInTheDocument();
    expect(noButton).toBeEnabled();
    await userEvent.click(noButton);
    expect(mockedOnPermission).toHaveBeenCalledTimes(1);
    expect(mockedOnPermission).toHaveBeenCalledWith(false);
  });

  it("should call onPermission with true if request is approved", async () => {
    const mockedOnPermission = vi.fn(async () => {});
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          onPermission: mockedOnPermission,
          canProceed: true,
        },
      }),
    );

    const yesButton = screen.getByRole("button", { name: "Yes" });
    expect(yesButton).toBeInTheDocument();
    expect(yesButton).toBeEnabled();
    await userEvent.click(yesButton);
    expect(mockedOnPermission).toHaveBeenCalledTimes(1);
    expect(mockedOnPermission).toHaveBeenCalledWith(true);
  });

  describe("default RPC URL", () => {
    // Runs the approval the way the store does: the callback the component
    // registers is called with the user's answer.
    const approveWithRpcUrls = async (rpcUrls: string[]) => {
      let onPermissionCallBack: ((hasApproved: boolean) => Promise<void>) | undefined;
      const addChain = vi.fn(async () => ({
        chainFound: false,
        updatedChainList: [],
      }));
      renderComponent(
        mockedStore({
          dAppRequestStore: {
            dAppRequestData: {
              method: "wallet_addQRLChain",
              params: [
                {
                  chainName: "Example",
                  chainId: "0x1234",
                  nativeCurrency: { name: "Quanta", symbol: "QRL", decimals: 18 },
                  rpcUrls,
                },
              ],
              requestData: {
                senderData: { url: "https://dapp.example/" },
              },
            },
            setOnPermissionCallBack: (callBack: typeof onPermissionCallBack) => {
              onPermissionCallBack = callBack;
            },
            onPermission: async (hasApproved: boolean) => {
              await onPermissionCallBack?.(hasApproved);
            },
          },
          qrlStore: { addChain },
        }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Yes" }));
      return addChain;
    };

    it("uses the first acceptable URL when an earlier one is plain http", async () => {
      const addChain = await approveWithRpcUrls([
        "http://rpc.attacker.example/rpc",
        "https://rpc.example/rpc",
      ]);

      expect(addChain).toHaveBeenCalledTimes(1);
      expect(addChain).toHaveBeenCalledWith(
        expect.objectContaining({ defaultRpcUrl: "https://rpc.example/rpc" }),
      );
    });

    it("keeps the first URL when it is acceptable", async () => {
      const addChain = await approveWithRpcUrls([
        "https://rpc.example/rpc",
        "http://127.0.0.1:8545/",
      ]);

      expect(addChain).toHaveBeenCalledWith(
        expect.objectContaining({ defaultRpcUrl: "https://rpc.example/rpc" }),
      );
    });
  });
});
