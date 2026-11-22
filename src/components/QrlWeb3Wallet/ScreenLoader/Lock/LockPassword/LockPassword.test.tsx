import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LockPassword from "./LockPassword";

vi.mock("webextension-polyfill", async () => {
  const originalModule: any = await vi.importActual("webextension-polyfill");
  return {
    ...originalModule,
    default: {
      ...originalModule.default,
      tabs: {
        ...originalModule.default?.tabs,
        create: vi.fn(),
      },
      runtime: {
        ...originalModule.default?.runtime,
        getURL: vi.fn().mockReturnValue("chrome-extension://id/index.html"),
      },
    },
  };
});
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Lock/LockPassword/Onboarding/Onboarding",
  () => ({ default: () => <div>Mocked Onboarding</div> }),
);
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Lock/LockPassword/LockPasswordCheck/LockPasswordCheck",
  () => ({ default: () => <div>Mocked Lock Password Check</div> }),
);

describe("LockPassword", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <LockPassword />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the onboarding screen if the password has not been set", async () => {
    renderComponent(
      mockedStore({
        lockStore: { hasPasswordSet: false, isLocked: true },
        settingsStore: { isPopupWindow: false },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Mocked Onboarding")).toBeInTheDocument();
      expect(
        screen.queryByText("Mocked Lock Password Check"),
      ).not.toBeInTheDocument();
    });
  });

  it("does not hold the screen for an onboarding that has created nothing yet", async () => {
    // A second page that still shows the first steps must give way when the
    // wallet is created in another page. The onboarding marks itself when
    // it stores the first account; see Onboarding.
    const setOnboarding = vi.fn();
    renderComponent(
      mockedStore({
        lockStore: { hasPasswordSet: false, isLocked: true, setOnboarding },
        settingsStore: { isPopupWindow: false },
      }),
    );

    await screen.findByText("Mocked Onboarding");
    expect(setOnboarding).not.toHaveBeenCalled();
  });

  it("does not mark an onboarding when the password was set", async () => {
    const setOnboarding = vi.fn();
    renderComponent(
      mockedStore({
        lockStore: { hasPasswordSet: true, isLocked: true, setOnboarding },
        settingsStore: { isPopupWindow: false },
      }),
    );

    await screen.findByText("Mocked Lock Password Check");
    expect(setOnboarding).not.toHaveBeenCalled();
  });

  it("should render the lock password check screen if the password was set", async () => {
    renderComponent(
      mockedStore({
        lockStore: { hasPasswordSet: true, isLocked: true },
        settingsStore: { isPopupWindow: false },
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Mocked Lock Password Check"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Mocked Onboarding")).not.toBeInTheDocument();
    });
  });
});
