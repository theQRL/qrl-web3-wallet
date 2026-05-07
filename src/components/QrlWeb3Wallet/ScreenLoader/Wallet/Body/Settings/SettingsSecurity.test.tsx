import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SettingsSecurity from "./SettingsSecurity";

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("SettingsSecurity", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <SettingsSecurity />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the Security & Privacy heading", () => {
    renderComponent();

    expect(screen.getByText("Security & Privacy")).toBeInTheDocument();
  });

  it("should render the auto-lock select trigger", () => {
    renderComponent();

    expect(
      screen.getByRole("combobox", { name: "Auto-lock timeout" }),
    ).toBeInTheDocument();
  });

  it("should call setAutoLockMinutes when selecting an option", async () => {
    const setAutoLockMinutes = vi.fn<any>(() => Promise.resolve());
    renderComponent(mockedStore({ settingsStore: { setAutoLockMinutes } }));

    await userEvent.click(
      screen.getByRole("combobox", { name: "Auto-lock timeout" }),
    );
    await userEvent.click(screen.getByRole("option", { name: "5 minutes" }));

    expect(setAutoLockMinutes).toHaveBeenCalledWith(5);
  });

  it("should call setAutoLockMinutes with 0 for Never", async () => {
    const setAutoLockMinutes = vi.fn<any>(() => Promise.resolve());
    renderComponent(mockedStore({ settingsStore: { setAutoLockMinutes } }));

    await userEvent.click(
      screen.getByRole("combobox", { name: "Auto-lock timeout" }),
    );
    await userEvent.click(screen.getByRole("option", { name: "Never" }));

    expect(setAutoLockMinutes).toHaveBeenCalledWith(0);
  });

  it("should render the show balance and price checkbox", () => {
    renderComponent();

    expect(
      screen.getByLabelText("Show balance and token price"),
    ).toBeInTheDocument();
  });

  it("should render CoinGecko privacy notice", () => {
    renderComponent();

    expect(screen.getByText(/CoinGecko API/)).toBeInTheDocument();
  });

  it("should call setShowBalanceAndPrice when toggling checkbox", async () => {
    const setShowBalanceAndPrice = vi.fn<any>(() => Promise.resolve());
    const fetchPrices = vi.fn<any>(() => Promise.resolve());
    const startAutoRefresh = vi.fn<any>();
    renderComponent(
      mockedStore({
        settingsStore: { showBalanceAndPrice: true, setShowBalanceAndPrice },
        priceStore: { fetchPrices, startAutoRefresh },
      }),
    );

    // Click to uncheck (currently checked because showBalanceAndPrice: true)
    await userEvent.click(
      screen.getByLabelText("Show balance and token price"),
    );

    expect(setShowBalanceAndPrice).toHaveBeenCalledWith(false);
  });

  it("should start auto-refresh when enabling balance display", async () => {
    const setShowBalanceAndPrice = vi.fn<any>(() => Promise.resolve());
    const fetchPrices = vi.fn<any>(() => Promise.resolve());
    const startAutoRefresh = vi.fn<any>();
    renderComponent(
      mockedStore({
        settingsStore: { showBalanceAndPrice: false, setShowBalanceAndPrice },
        priceStore: { fetchPrices, startAutoRefresh },
      }),
    );

    // Click to check (currently unchecked because showBalanceAndPrice: false)
    await userEvent.click(
      screen.getByLabelText("Show balance and token price"),
    );

    expect(setShowBalanceAndPrice).toHaveBeenCalledWith(true);
    expect(fetchPrices).toHaveBeenCalled();
    expect(startAutoRefresh).toHaveBeenCalled();
  });

  it("should stop auto-refresh when disabling balance display", async () => {
    const setShowBalanceAndPrice = vi.fn<any>(() => Promise.resolve());
    const stopAutoRefresh = vi.fn<any>();
    renderComponent(
      mockedStore({
        settingsStore: { showBalanceAndPrice: true, setShowBalanceAndPrice },
        priceStore: { stopAutoRefresh },
      }),
    );

    await userEvent.click(
      screen.getByLabelText("Show balance and token price"),
    );

    expect(setShowBalanceAndPrice).toHaveBeenCalledWith(false);
    expect(stopAutoRefresh).toHaveBeenCalled();
  });

  describe("Change Password", () => {
    it("should render the Change Password button", () => {
      renderComponent();

      expect(
        screen.getByRole("button", { name: /Change Password/i }),
      ).toBeInTheDocument();
    });

    it("should open the dialog when clicking Change Password", async () => {
      renderComponent();

      await userEvent.click(
        screen.getByRole("button", { name: /Change Password/i }),
      );

      expect(
        screen.getByText("Enter your current password and choose a new one."),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("Current password"),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("New password"),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("Confirm new password"),
      ).toBeInTheDocument();
    });

    it("should keep the submit button disabled until all fields are valid", async () => {
      renderComponent();

      await userEvent.click(
        screen.getByRole("button", { name: /Change Password/i }),
      );

      const dialog = screen.getByRole("dialog");
      const submitButton = within(dialog).getByRole("button", { name: /Change Password/i });
      expect(submitButton).toBeDisabled();

      // Fill only current password — still disabled
      await userEvent.type(screen.getByLabelText("Current password"), "oldpass12345");
      expect(submitButton).toBeDisabled();

      // Fill new password but not confirm — still disabled
      await userEvent.type(screen.getByLabelText("New password"), "newpass12345");
      expect(submitButton).toBeDisabled();

      // Fill confirm with matching password — now enabled
      await userEvent.type(screen.getByLabelText("Confirm new password"), "newpass12345");
      await waitFor(() => {
        expect(submitButton).toBeEnabled();
      });
    });

    it("should show validation error when new passwords don't match", async () => {
      renderComponent();

      await userEvent.click(
        screen.getByRole("button", { name: /Change Password/i }),
      );

      await userEvent.type(screen.getByLabelText("Current password"), "oldpass12345");
      await userEvent.type(screen.getByLabelText("New password"), "newpass12345");
      await userEvent.type(screen.getByLabelText("Confirm new password"), "different123");

      await waitFor(() => {
        expect(screen.getByText("Passwords doesn't match")).toBeInTheDocument();
      });
    });

    it("should call changePassword and show success on correct password", async () => {
      const changePassword = vi.fn<any>(() => Promise.resolve(true));
      renderComponent(
        mockedStore({ lockStore: { changePassword } }),
      );

      await userEvent.click(
        screen.getByRole("button", { name: /Change Password/i }),
      );

      await userEvent.type(screen.getByLabelText("Current password"), "oldpass12345");
      await userEvent.type(screen.getByLabelText("New password"), "newpass12345");
      await userEvent.type(screen.getByLabelText("Confirm new password"), "newpass12345");

      const dialog = screen.getByRole("dialog");
      const submitButton = within(dialog).getByRole("button", { name: /Change Password/i });
      await waitFor(() => {
        expect(submitButton).toBeEnabled();
      });

      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(changePassword).toHaveBeenCalledWith("oldpass12345", "newpass12345");
        expect(screen.getByText("Password changed successfully")).toBeInTheDocument();
      });
    });

    it("should show error when current password is incorrect", async () => {
      const changePassword = vi.fn<any>(() => Promise.resolve(false));
      renderComponent(
        mockedStore({ lockStore: { changePassword } }),
      );

      await userEvent.click(
        screen.getByRole("button", { name: /Change Password/i }),
      );

      await userEvent.type(screen.getByLabelText("Current password"), "wrongpass123");
      await userEvent.type(screen.getByLabelText("New password"), "newpass12345");
      await userEvent.type(screen.getByLabelText("Confirm new password"), "newpass12345");

      const dialog = screen.getByRole("dialog");
      const submitButton = within(dialog).getByRole("button", { name: /Change Password/i });
      await waitFor(() => {
        expect(submitButton).toBeEnabled();
      });

      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(changePassword).toHaveBeenCalledWith("wrongpass123", "newpass12345");
        expect(screen.getByText("Current password is incorrect")).toBeInTheDocument();
      });
    });
  });
});
