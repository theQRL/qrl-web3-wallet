import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ImportLedger from "./ImportLedger";

const {
  mockNavigate,
  mockAddLedgerAccountToAllAccounts,
  mockSetLedgerAccounts,
  mockGetLedgerAccounts,
  mockGetAllAccounts,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockAddLedgerAccountToAllAccounts: vi.fn<any>().mockResolvedValue(undefined),
  mockSetLedgerAccounts: vi.fn<any>().mockResolvedValue(undefined),
  mockGetLedgerAccounts: vi.fn<any>().mockResolvedValue([]),
  mockGetAllAccounts: vi.fn<any>().mockResolvedValue([]),
}));

vi.mock("react-router-dom", async () => ({
  ...await vi.importActual<typeof import("react-router-dom")>("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

vi.mock("@/utilities/storageUtil", async () => {
  const addFn = (...args: any[]) => mockAddLedgerAccountToAllAccounts(...args);
  const setFn = (...args: any[]) => mockSetLedgerAccounts(...args);
  const getFn = (...args: any[]) => mockGetLedgerAccounts(...args);
  const getAllFn = (...args: any[]) => mockGetAllAccounts(...args);
  return {
    __esModule: true,
    default: {
      addLedgerAccountToAllAccounts: addFn,
      setLedgerAccounts: setFn,
      getLedgerAccounts: getFn,
      getAllAccounts: getAllFn,
    },
  };
});

describe("ImportLedger", () => {
  afterEach(() => {
    cleanup();
    mockNavigate.mockClear();
    mockAddLedgerAccountToAllAccounts.mockReset().mockResolvedValue(undefined);
    mockSetLedgerAccounts.mockReset().mockResolvedValue(undefined);
    mockGetLedgerAccounts.mockReset().mockResolvedValue([]);
    mockGetAllAccounts.mockReset().mockResolvedValue([]);
  });

  const renderComponent = (storeOverrides = {}) =>
    render(
      <StoreProvider value={mockedStore(storeOverrides)}>
        <MemoryRouter>
          <ImportLedger />
        </MemoryRouter>
      </StoreProvider>,
    );

  describe("Step 1: Connect", () => {
    it("should render the connect step initially", () => {
      renderComponent();

      expect(screen.getByText("Connect Ledger Device")).toBeInTheDocument();
      expect(
        screen.getByText(/Connect your Ledger device and open the QRL Zond app/),
      ).toBeInTheDocument();
      expect(screen.getByText("Before connecting:")).toBeInTheDocument();
      expect(
        screen.getByText("Connect your Ledger device via USB"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Unlock your device with your PIN"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Open the QRL Zond app on your device"),
      ).toBeInTheDocument();
    });

    it("should show Connect Ledger button", () => {
      renderComponent();

      const button = screen.getByRole("button", { name: /Connect Ledger/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeEnabled();
    });

    it("should call ledgerStore.connect when button is clicked", async () => {
      const mockConnect = vi.fn<any>().mockResolvedValue(undefined);

      renderComponent({
        ledgerStore: { connect: mockConnect } as any,
      });

      const button = screen.getByRole("button", { name: /Connect Ledger/i });
      await userEvent.click(button);

      expect(mockConnect).toHaveBeenCalled();
    });

    it("should show Connecting... when isConnecting is true", () => {
      renderComponent({
        ledgerStore: { isConnecting: true } as any,
      });

      expect(screen.getByText("Connecting...")).toBeInTheDocument();
      const button = screen.getByRole("button", { name: /Connecting/i });
      expect(button).toBeDisabled();
    });

    it("should display connectionError from store", () => {
      renderComponent({
        ledgerStore: { connectionError: "Device not found" } as any,
      });

      expect(screen.getByText("Device not found")).toBeInTheDocument();
    });

    it("should display error when connect throws an Error", async () => {
      const mockConnect = vi.fn<any>().mockRejectedValue(new Error("WebHID not supported"));

      renderComponent({
        ledgerStore: { connect: mockConnect } as any,
      });

      await userEvent.click(screen.getByRole("button", { name: /Connect Ledger/i }));

      await waitFor(() => {
        expect(screen.getByText("WebHID not supported")).toBeInTheDocument();
      });
    });

    it("should display generic error when connect throws a non-Error", async () => {
      const mockConnect = vi.fn<any>().mockRejectedValue("unknown error");

      renderComponent({
        ledgerStore: { connect: mockConnect } as any,
      });

      await userEvent.click(screen.getByRole("button", { name: /Connect Ledger/i }));

      await waitFor(() => {
        expect(screen.getByText("Failed to connect to Ledger device. Check the USB connection.")).toBeInTheDocument();
      });
    });
  });

  describe("Step 2: Select Accounts", () => {
    const ledgerAccounts = [
      { address: "Q0000000000000000000000000000000000000000000000000000000020aaa111bbb222ccc333ddd444eee555fff6660A00000000000000000000000000000000", index: 0, derivationPath: "m/44'/238'/0'/0/0", publicKey: "0xpub1" },
      { address: "Q0000000000000000000000000000000000000000000000000000000020bbb222ccc333ddd444eee555fff666aaa7770B00000000000000000000000000000000", index: 1, derivationPath: "m/44'/238'/0'/0/1", publicKey: "0xpub2" },
      { address: "Q0000000000000000000000000000000000000000000000000000000020ccc333ddd444eee555fff666aaa777bbb8880C00000000000000000000000000000000", index: 2, derivationPath: "m/44'/238'/0'/0/2", publicKey: "0xpub3" },
    ];

    it("should transition to select step when device is connected", () => {
      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
      });

      expect(screen.getByText("Select Accounts")).toBeInTheDocument();
      expect(
        screen.getByText(/Choose which accounts you want to import/),
      ).toBeInTheDocument();
    });

    it("should show device info when available", () => {
      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          deviceInfo: { model: "Nano S Plus", version: "1.2.3" },
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
      });

      expect(
        screen.getByText(/Connected to Nano S Plus \(v1\.2\.3\)/),
      ).toBeInTheDocument();
    });

    it("should show loading state when loading accounts with no accounts yet", () => {
      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: [],
          isLoadingAccounts: true,
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
      });

      expect(screen.getByText("Loading accounts...")).toBeInTheDocument();
    });

    it("should display account list with truncated addresses", () => {
      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
      });

      expect(screen.getAllByText(/Q0000000\.\.\.000000/)).toHaveLength(3);
      expect(screen.getByText("Account #1")).toBeInTheDocument();
      expect(screen.getByText("Account #2")).toBeInTheDocument();
      expect(screen.getByText("Account #3")).toBeInTheDocument();
    });

    it("should toggle account selection when account is clicked", async () => {
      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
      });

      // Initially the button says "Import 0 accounts" and is disabled
      const importButton = screen.getByRole("button", { name: /Import 0 accounts/i });
      expect(importButton).toBeDisabled();

      // Click first account to select
      await userEvent.click(screen.getByText("Account #1"));

      // Now it should say "Import 1 account"
      expect(screen.getByRole("button", { name: /Import 1 account$/i })).toBeEnabled();

      // Click second account
      await userEvent.click(screen.getByText("Account #2"));
      expect(screen.getByRole("button", { name: /Import 2 accounts/i })).toBeEnabled();

      // Click first account again to deselect
      await userEvent.click(screen.getByText("Account #1"));
      expect(screen.getByRole("button", { name: /Import 1 account$/i })).toBeEnabled();
    });

    it("should show Import button as disabled when no accounts selected", () => {
      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
      });

      const importButton = screen.getByRole("button", { name: /Import 0 accounts/i });
      expect(importButton).toBeDisabled();
    });

    it("should import selected accounts and merge with existing", async () => {
      const existingAccount = {
        address: "Q0000000000000000000000000000000000000000000000000000000020eee555fff666aaa777bbb888ccc999dddEEE0E00000000000000000000000000000000",
        index: 5,
        derivationPath: "m/44'/238'/0'/0/5",
        publicKey: "0xpubExisting",
      };
      mockGetLedgerAccounts.mockReset().mockResolvedValue([existingAccount]);

      const mockFetchAccounts = vi.fn<any>().mockResolvedValue(undefined);

      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
        qrlStore: {
          fetchAccounts: mockFetchAccounts,
        },
      });

      // Select first and third accounts
      await userEvent.click(screen.getByText("Account #1"));
      await userEvent.click(screen.getByText("Account #3"));

      // Click Import
      await userEvent.click(
        screen.getByRole("button", { name: /Import 2 accounts/i }),
      );

      await waitFor(() => {
        expect(mockAddLedgerAccountToAllAccounts).toHaveBeenCalledTimes(2);
        expect(mockAddLedgerAccountToAllAccounts).toHaveBeenCalledWith(
          ledgerAccounts[0].address,
        );
        expect(mockAddLedgerAccountToAllAccounts).toHaveBeenCalledWith(
          ledgerAccounts[2].address,
        );
      });

      // Should merge with existing accounts
      expect(mockSetLedgerAccounts).toHaveBeenCalledWith([
        existingAccount,
        ledgerAccounts[0],
        ledgerAccounts[2],
      ]);
      expect(mockFetchAccounts).toHaveBeenCalled();

      // Should transition to success step
      expect(screen.getByText("Import Successful")).toBeInTheDocument();
      expect(screen.getByText("2 accounts imported")).toBeInTheDocument();
    });

    it("should show error when import fails", async () => {
      mockAddLedgerAccountToAllAccounts.mockReset().mockRejectedValue(
        new Error("Storage full"),
      );

      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
      });

      await userEvent.click(screen.getByText("Account #1"));
      await userEvent.click(
        screen.getByRole("button", { name: /Import 1 account$/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Storage full")).toBeInTheDocument();
      });
    });

    it("should show generic error when import fails with non-Error", async () => {
      mockAddLedgerAccountToAllAccounts.mockReset().mockRejectedValue("unknown");

      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
      });

      await userEvent.click(screen.getByText("Account #1"));
      await userEvent.click(
        screen.getByRole("button", { name: /Import 1 account$/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Failed to import accounts")).toBeInTheDocument();
      });
    });
  });

  describe("Step 2: Pagination", () => {
    const ledgerAccounts = [
      { address: "Q0000000000000000000000000000000000000000000000000000000020aaa111bbb222ccc333ddd444eee555fff6660A00000000000000000000000000000000", index: 0, derivationPath: "m/44'/238'/0'/0/0", publicKey: "0xpub1" },
      { address: "Q0000000000000000000000000000000000000000000000000000000020bbb222ccc333ddd444eee555fff666aaa7770B00000000000000000000000000000000", index: 1, derivationPath: "m/44'/238'/0'/0/1", publicKey: "0xpub2" },
    ];

    it("should show Previous and Next buttons", () => {
      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
      });

      expect(screen.getByRole("button", { name: /Previous/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Next/i })).toBeInTheDocument();
    });

    it("should disable Previous button on first page", () => {
      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
      });

      expect(screen.getByRole("button", { name: /Previous/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled();
    });

    it("should call fetchPageAccounts with next page offset when Next is clicked", async () => {
      const mockFetchPageAccounts = vi.fn<any>().mockResolvedValue(undefined);

      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: mockFetchPageAccounts,
        } as any,
      });

      // Clear the initial call from useEffect
      mockFetchPageAccounts.mockClear();

      await userEvent.click(screen.getByRole("button", { name: /Next/i }));

      expect(mockFetchPageAccounts).toHaveBeenCalledWith(5, 5);
    });

    it("should call fetchPageAccounts with previous page offset when Previous is clicked after Next", async () => {
      const mockFetchPageAccounts = vi.fn<any>().mockResolvedValue(undefined);

      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: mockFetchPageAccounts,
        } as any,
      });

      mockFetchPageAccounts.mockClear();

      // Go to page 2
      await userEvent.click(screen.getByRole("button", { name: /Next/i }));
      expect(mockFetchPageAccounts).toHaveBeenCalledWith(5, 5);

      mockFetchPageAccounts.mockClear();

      // Go back to page 1
      await userEvent.click(screen.getByRole("button", { name: /Previous/i }));
      expect(mockFetchPageAccounts).toHaveBeenCalledWith(5, 0);
    });

    it("should disable both pagination buttons when loading", () => {
      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          isLoadingAccounts: true,
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
      });

      expect(screen.getByRole("button", { name: /Previous/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
    });

    it("should show error when pagination fails", async () => {
      const mockFetchPageAccounts = vi.fn<any>()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Transport error"));

      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: mockFetchPageAccounts,
        } as any,
      });

      await userEvent.click(screen.getByRole("button", { name: /Next/i }));

      await waitFor(() => {
        expect(screen.getByText("Transport error")).toBeInTheDocument();
      });
    });

    it("should show generic error when pagination fails with non-Error", async () => {
      const mockFetchPageAccounts = vi.fn<any>()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce("unknown");

      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: mockFetchPageAccounts,
        } as any,
      });

      await userEvent.click(screen.getByRole("button", { name: /Next/i }));

      await waitFor(() => {
        expect(screen.getByText("Failed to load accounts")).toBeInTheDocument();
      });
    });
  });

  describe("Step 2: Already Imported Accounts", () => {
    const ledgerAccounts = [
      { address: "Q0000000000000000000000000000000000000000000000000000000020aaa111bbb222ccc333ddd444eee555fff6660A00000000000000000000000000000000", index: 0, derivationPath: "m/44'/238'/0'/0/0", publicKey: "0xpub1" },
      { address: "Q0000000000000000000000000000000000000000000000000000000020bbb222ccc333ddd444eee555fff666aaa7770B00000000000000000000000000000000", index: 1, derivationPath: "m/44'/238'/0'/0/1", publicKey: "0xpub2" },
      { address: "Q0000000000000000000000000000000000000000000000000000000020ccc333ddd444eee555fff666aaa777bbb8880C00000000000000000000000000000000", index: 2, derivationPath: "m/44'/238'/0'/0/2", publicKey: "0xpub3" },
    ];

    it("should show 'Already imported' for previously imported accounts", async () => {
      mockGetAllAccounts.mockReset().mockResolvedValue([
        ledgerAccounts[0].address,
        ledgerAccounts[2].address,
      ]);

      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
      });

      await waitFor(() => {
        const importedLabels = screen.getAllByText("Already imported");
        expect(importedLabels).toHaveLength(2);
      });
    });

    it("should not toggle already-imported accounts when clicked", async () => {
      mockGetAllAccounts.mockReset().mockResolvedValue([ledgerAccounts[0].address]);

      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
      });

      await waitFor(() => {
        expect(screen.getByText("Already imported")).toBeInTheDocument();
      });

      // Click already imported account
      await userEvent.click(screen.getByText("Account #1"));

      // Import button should still show 0 (already-imported is not counted)
      expect(screen.getByRole("button", { name: /Import 0 accounts/i })).toBeDisabled();
    });

    it("should only count newly selected accounts in Import button", async () => {
      mockGetAllAccounts.mockReset().mockResolvedValue([ledgerAccounts[0].address]);

      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
      });

      await waitFor(() => {
        expect(screen.getByText("Already imported")).toBeInTheDocument();
      });

      // Select a non-imported account
      await userEvent.click(screen.getByText("Account #2"));

      // Should show 1 (only the newly selected, not the already-imported)
      expect(screen.getByRole("button", { name: /Import 1 account$/i })).toBeEnabled();
    });

    it("should not re-import already-imported accounts during merge", async () => {
      const existingAccount = ledgerAccounts[0];
      mockGetAllAccounts.mockReset().mockResolvedValue([existingAccount.address]);
      mockGetLedgerAccounts.mockReset().mockResolvedValue([existingAccount]);

      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
        qrlStore: {
          fetchAccounts: vi.fn<any>().mockResolvedValue(undefined),
        },
      });

      await waitFor(() => {
        expect(screen.getByText("Already imported")).toBeInTheDocument();
      });

      // Select account #2 (not imported)
      await userEvent.click(screen.getByText("Account #2"));

      await userEvent.click(
        screen.getByRole("button", { name: /Import 1 account$/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Import Successful")).toBeInTheDocument();
      });

      // Should merge: existing + new
      expect(mockSetLedgerAccounts).toHaveBeenCalledWith([
        existingAccount,
        ledgerAccounts[1],
      ]);
    });
  });

  describe("Step 3: Success", () => {
    const ledgerAccounts = [
      { address: "Q0000000000000000000000000000000000000000000000000000000020aaa111bbb222ccc333ddd444eee555fff6660A00000000000000000000000000000000", index: 0, derivationPath: "m/44'/238'/0'/0/0", publicKey: "0xpub1" },
    ];

    it("should show success step after import and navigate home on Done", async () => {
      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: ledgerAccounts,
          fetchPageAccounts: vi.fn<any>().mockResolvedValue(undefined),
        } as any,
        qrlStore: {
          fetchAccounts: vi.fn<any>().mockResolvedValue(undefined),
        },
      });

      // Select and import
      await userEvent.click(screen.getByText("Account #1"));
      await userEvent.click(
        screen.getByRole("button", { name: /Import 1 account$/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Import Successful")).toBeInTheDocument();
      });

      expect(
        screen.getByText("Your Ledger accounts have been imported successfully."),
      ).toBeInTheDocument();
      expect(screen.getByText("1 account imported")).toBeInTheDocument();
      expect(
        screen.getByText(/You can now use these accounts to sign transactions/),
      ).toBeInTheDocument();

      // Click Done
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  describe("fetchPageAccounts error in useEffect", () => {
    it("should show error when initial fetchPageAccounts fails with Error", async () => {
      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: [],
          fetchPageAccounts: vi.fn<any>().mockRejectedValue(new Error("App not open")),
        } as any,
      });

      await waitFor(() => {
        expect(screen.getByText("App not open")).toBeInTheDocument();
      });
    });

    it("should show generic error when initial fetchPageAccounts fails with non-Error", async () => {
      renderComponent({
        ledgerStore: {
          isConnected: true,
          accounts: [],
          fetchPageAccounts: vi.fn<any>().mockRejectedValue("unknown"),
        } as any,
      });

      await waitFor(() => {
        expect(screen.getByText("Failed to load accounts from device")).toBeInTheDocument();
      });
    });
  });
});
