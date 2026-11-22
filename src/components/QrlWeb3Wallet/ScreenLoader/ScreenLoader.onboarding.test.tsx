import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
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

const renderWith = (lockStore: { isLocked: boolean; isOnboarding: boolean }) =>
  render(
    <StoreProvider
      value={mockedStore({
        lockStore,
        dAppRequestStore: { hasDAppRequest: false },
      })}
    >
      <MemoryRouter>
        <ScreenLoader />
      </MemoryRouter>
    </StoreProvider>,
  );

describe("ScreenLoader during the first-run onboarding", () => {
  afterEach(cleanup);

  it("stays on the lock screen while the onboarding is on screen, although the wallet is unlocked", async () => {
    renderWith({ isLocked: false, isOnboarding: true });

    expect(await screen.findByText("Mocked Lock")).toBeInTheDocument();
    expect(screen.queryByText("Mocked Wallet")).not.toBeInTheDocument();
  });

  it("shows the wallet when it is unlocked and no onboarding is running", async () => {
    renderWith({ isLocked: false, isOnboarding: false });

    expect(await screen.findByText("Mocked Wallet")).toBeInTheDocument();
    expect(screen.queryByText("Mocked Lock")).not.toBeInTheDocument();
  });
});
