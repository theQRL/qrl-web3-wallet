import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import type { StorageSchemaState } from "@/utilities/storageUtil";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScreenLoader from "./ScreenLoader";

vi.mock("@/components/QrlWeb3Wallet/ScreenLoader/Lock/Lock", () => ({
  default: () => <div>Mocked Lock</div>,
}));
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/DAppRequest/DAppRequest",
  () => ({ default: () => <div>Mocked DApp Request</div> }),
);
vi.mock("@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Wallet", () => ({
  default: () => <div>Mocked Wallet</div>,
}));
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/FreshWallet/FreshWallet",
  () => ({ default: () => <div>Mocked Fresh Wallet</div> }),
);

describe("ScreenLoader and the stored wallet's version", () => {
  afterEach(() => {
    cleanup();
  });

  const renderLoader = (storageState: StorageSchemaState | "checking") => {
    const readLockState = vi.fn(async () => {});
    const readDAppRequestData = vi.fn(async () => {});
    const { container } = render(
      <StoreProvider
        value={mockedStore({
          lockStore: { isLocked: true, storageState, readLockState },
          dAppRequestStore: { hasDAppRequest: true, readDAppRequestData },
        })}
      >
        <MemoryRouter>
          <ScreenLoader />
        </MemoryRouter>
      </StoreProvider>,
    );
    return { container, readLockState, readDAppRequestData };
  };

  it("shows the fresh-wallet screen for a wallet of an earlier build and loads nothing else", async () => {
    const { readLockState, readDAppRequestData } = renderLoader("outdated");

    expect(await screen.findByText("Mocked Fresh Wallet")).toBeInTheDocument();
    expect(screen.queryByText("Mocked Lock")).not.toBeInTheDocument();
    expect(screen.queryByText("Mocked DApp Request")).not.toBeInTheDocument();
    expect(readLockState).not.toHaveBeenCalled();
    expect(readDAppRequestData).not.toHaveBeenCalled();
  });

  it("opens as before when the store is current", async () => {
    const { readLockState, readDAppRequestData } = renderLoader("current");

    expect(await screen.findByText("Mocked Lock")).toBeInTheDocument();
    expect(screen.queryByText("Mocked Fresh Wallet")).not.toBeInTheDocument();
    expect(readLockState).toHaveBeenCalledTimes(1);
    expect(readDAppRequestData).toHaveBeenCalledTimes(1);
  });

  it("shows and loads nothing while the store is being checked", () => {
    const { container, readLockState, readDAppRequestData } =
      renderLoader("checking");

    expect(container).toBeEmptyDOMElement();
    expect(readLockState).not.toHaveBeenCalled();
    expect(readDAppRequestData).not.toHaveBeenCalled();
  });
});
