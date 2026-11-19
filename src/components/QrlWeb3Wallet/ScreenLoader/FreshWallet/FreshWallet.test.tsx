import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FreshWallet from "./FreshWallet";

const { exportWalletBackup } = vi.hoisted(() => ({
  exportWalletBackup: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/functions/exportWalletBackup", () => ({ exportWalletBackup }));

const reload = vi.fn();

describe("FreshWallet", () => {
  beforeEach(() => {
    exportWalletBackup.mockReset().mockResolvedValue(undefined);
    reload.mockReset();
    vi.stubGlobal("location", { reload });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const renderScreen = (resetOutdatedStorage = vi.fn(async () => {})) => {
    render(
      <StoreProvider value={mockedStore({ lockStore: { resetOutdatedStorage } })}>
        <FreshWallet />
      </StoreProvider>,
    );
    return {
      resetOutdatedStorage,
      exportButton: screen.getByRole("button", { name: "Export Backup" }),
      resetButton: screen.getByRole("button", {
        name: "Remove the old wallet and start fresh",
      }),
      confirm: screen.getByRole("checkbox"),
    };
  };

  it("says what the screen is for and removes nothing by itself", () => {
    const { resetOutdatedStorage, resetButton } = renderScreen();

    expect(
      screen.getByText("This testnet build needs a fresh wallet"),
    ).toBeInTheDocument();
    expect(resetButton).toBeDisabled();
    expect(resetOutdatedStorage).not.toHaveBeenCalled();
    expect(exportWalletBackup).not.toHaveBeenCalled();
  });

  it("exports the backup and leaves the stored wallet in place", async () => {
    const { resetOutdatedStorage, exportButton } = renderScreen();

    await userEvent.click(exportButton);

    expect(exportWalletBackup).toHaveBeenCalledTimes(1);
    expect(resetOutdatedStorage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("removes the stored wallet only after the confirmation, then reloads", async () => {
    const { resetOutdatedStorage, resetButton, confirm } = renderScreen();

    await userEvent.click(resetButton);
    expect(resetOutdatedStorage).not.toHaveBeenCalled();

    await userEvent.click(confirm);
    await userEvent.click(resetButton);

    expect(resetOutdatedStorage).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  it("reports a failed removal and does not reload", async () => {
    const { resetButton, confirm } = renderScreen(
      vi.fn(async () => {
        throw new Error("service worker unavailable");
      }),
    );

    await userEvent.click(confirm);
    await userEvent.click(resetButton);

    expect(
      await screen.findByText(
        "The stored wallet could not be removed. Try again.",
      ),
    ).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    expect(resetButton).toBeEnabled();
  });

  it("reports a failed export", async () => {
    exportWalletBackup.mockRejectedValue(new Error("no storage"));
    const { exportButton } = renderScreen();

    await userEvent.click(exportButton);

    expect(
      await screen.findByText("The backup could not be exported."),
    ).toBeInTheDocument();
  });
});
