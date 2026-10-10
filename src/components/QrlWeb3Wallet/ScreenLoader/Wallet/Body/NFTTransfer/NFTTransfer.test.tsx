import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { QRL_EXAMPLE_ADDRESS } from "@/constants/address";
import {
  LEGACY_ACCOUNT_RECOVERY_MESSAGE,
  RECOVERY_ONLY_ACCOUNT_MESSAGE,
} from "@/utilities/addressUtil";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import browser from "webextension-polyfill";
import NFTTransfer from "./NFTTransfer";

vi.mock("@/utilities/storageUtil", () => ({
  __esModule: true,
  default: {
    getActiveBlockChain: async () => ({ chainId: "0x1" }),
  },
}));

const defaultState = {
  contractAddress:
    "Q0000000000000000000000000000000000000000000000000000000020b714091cf2a62dadda2847803e3f1b9d2d377900000000000000000000000000000000",
  tokenId: "7",
  collectionName: "TestNFT",
  imageUrl: "https://example.com/nft.png",
  nftName: "Cool Token #7",
};

describe("NFTTransfer", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue([]);
  });

  const renderComponent = (
    state = defaultState,
    mockedStoreValues = mockedStore(),
  ) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter initialEntries={[{ pathname: "/nft-transfer", state }]}>
          <NFTTransfer />
        </MemoryRouter>
      </StoreProvider>,
    );

  it.each([
    {
      accountType: "legacy",
      address: `Q${"ab".repeat(20)}`,
      recoveryOnly: false,
      message: LEGACY_ACCOUNT_RECOVERY_MESSAGE,
    },
    {
      accountType: "legacy recovery-only",
      address: `Q${"ab".repeat(20)}`,
      recoveryOnly: true,
      message: LEGACY_ACCOUNT_RECOVERY_MESSAGE,
    },
    {
      accountType: "64-byte recovery-only",
      address: QRL_EXAMPLE_ADDRESS,
      recoveryOnly: true,
      message: RECOVERY_ONLY_ACCOUNT_MESSAGE,
    },
  ])(
    "blocks a $accountType account before submission",
    async ({ address, recoveryOnly, message }) => {
      vi.mocked(browser.runtime.sendMessage).mockResolvedValue([
        {
          address: address.toUpperCase(),
          recoveryOnly,
          seed: "",
          mnemonicPhrases: "",
        },
      ]);
      const getAccountSeed = vi.fn(async () => "");
      const getGasFeeData = vi.fn();
      const signNftTransfer = vi.fn();
      renderComponent(
        defaultState,
        mockedStore({
          lockStore: { getAccountSeed },
          qrlStore: {
            activeAccount: { accountAddress: address },
            getGasFeeData,
            signNftTransfer,
          },
        }),
      );

      expect(await screen.findByText(message)).toHaveClass("text-destructive");
      const sendButton = screen.getByRole("button", { name: "Send NFT" });
      expect(sendButton).toBeDisabled();
      const user = userEvent.setup();
      await user.click(screen.getByRole("textbox", { name: "receiverAddress" }));
      await user.paste(QRL_EXAMPLE_ADDRESS);
      expect(sendButton).toBeDisabled();
      await user.click(sendButton);
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(getGasFeeData).not.toHaveBeenCalled();
      expect(getAccountSeed).not.toHaveBeenCalled();
      expect(signNftTransfer).not.toHaveBeenCalled();
    },
  );

  it("signs a 64-byte account while another account is recovery-only", async () => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue([
      {
        address: `Q${"ff".repeat(64)}`,
        recoveryOnly: true,
        seed: "",
        mnemonicPhrases: "",
      },
    ]);
    const signNftTransfer = vi.fn(async () => ({
      transactionHash: "0xtxhash",
      rawTransaction: "0xraw",
      error: "",
    }));
    const addTransaction = vi.fn(async () => {});
    renderComponent(
      defaultState,
      mockedStore({
        qrlStore: { signNftTransfer },
        transactionHistoryStore: { addTransaction },
      }),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("textbox", { name: "receiverAddress" }));
    await user.paste(QRL_EXAMPLE_ADDRESS);
    const sendButton = screen.getByRole("button", { name: "Send NFT" });
    await waitFor(() => expect(sendButton).toBeEnabled());
    await user.click(sendButton);
    expect(signNftTransfer).toHaveBeenCalledWith(
      QRL_EXAMPLE_ADDRESS,
      QRL_EXAMPLE_ADDRESS,
      defaultState.tokenId,
      QRL_EXAMPLE_ADDRESS,
      defaultState.contractAddress,
    );
    expect(addTransaction).toHaveBeenCalledWith(
      QRL_EXAMPLE_ADDRESS,
      expect.objectContaining({
        transactionHash: "0xtxhash",
        pendingStatus: "pending",
      }),
    );
    expect(
      screen.queryByText(RECOVERY_ONLY_ACCOUNT_MESSAGE),
    ).not.toBeInTheDocument();
  });

  it("should render the send NFT heading", () => {
    renderComponent();
    expect(
      screen.getByRole("heading", { name: "Send NFT" }),
    ).toBeInTheDocument();
  });

  it("should display NFT name and token ID", () => {
    renderComponent();
    expect(screen.getByText("Cool Token #7")).toBeInTheDocument();
    expect(screen.getByText("Token #7")).toBeInTheDocument();
  });

  it("should render receiver address input", () => {
    renderComponent();
    const input = screen.getByRole("textbox", { name: "receiverAddress" });
    expect(input).toBeInTheDocument();
  });

  it("should render cancel and send buttons", () => {
    renderComponent();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getAllByText("Send NFT").length).toBeGreaterThanOrEqual(1);
  });

  it("should render address book button", () => {
    renderComponent();
    expect(
      screen.getByRole("button", { name: /address book/i }),
    ).toBeInTheDocument();
  });

  it("should render NFT image when provided", () => {
    renderComponent();
    const img = screen.getByAltText("Cool Token #7");
    expect(img).toHaveAttribute("src", "https://example.com/nft.png");
  });

  it("should show fallback when no image URL", () => {
    renderComponent({
      ...defaultState,
      imageUrl: "",
      nftName: "",
    });
    expect(screen.getByText("TestNFT #7")).toBeInTheDocument();
  });

  it("should have a back button", () => {
    renderComponent();
    expect(screen.getByTestId("backButtonTestId")).toBeInTheDocument();
  });

  it("should have send button disabled when form is empty", () => {
    renderComponent();
    const sendButtons = screen.getAllByRole("button");
    const sendButton = sendButtons.find(
      (btn) =>
        btn.textContent?.includes("Send NFT") &&
        btn.getAttribute("type") !== "button",
    );
    expect(sendButton).toBeDisabled();
  });

  it("should sign NFT transfer with Ledger account", async () => {
    const mockSignNftTransfer = vi.fn<any>();
    const mockSignAndSerializeTransaction = vi
      .fn<any>()
      .mockResolvedValue("0x02f8a00180843b9aca00843b9aca0082520894");
    const mockAddTransaction = vi.fn<any>().mockResolvedValue(undefined);
    const mockSafeTransferFrom = vi.fn<any>().mockReturnValue({
      encodeABI: () => "0x42842e0e",
    });
    const MockContract = vi.fn<any>().mockImplementation(() => ({
      methods: {
        safeTransferFrom: mockSafeTransferFrom,
      },
    }));

    renderComponent(
      defaultState,
      mockedStore({
        ledgerStore: {
          isLedgerAccount: () => true,
          signAndSerializeTransaction: mockSignAndSerializeTransaction,
        } as any,
        qrlStore: {
          qrlInstance: {
            Contract: MockContract,
            getTransactionCount: async () => 2,
            getChainId: async () => 1,
          } as any,
          getGasFeeData: async () => ({
            baseFeePerGas: BigInt(0),
            maxFeePerGas: BigInt(2250000007),
            maxPriorityFeePerGas: BigInt(2250000000),
          }),
          signNftTransfer: mockSignNftTransfer,
          sendRawTransaction: vi.fn<any>().mockResolvedValue(undefined),
        },
        transactionHistoryStore: {
          addTransaction: mockAddTransaction,
        },
      }),
    );

    await userEvent.type(
      screen.getByRole("textbox", { name: "receiverAddress" }),
      "Q0000000000000000000000000000000000000000000000000000000020fb08ff1f1376a14c055e9f56df80563e16722b00000000000000000000000000000000",
    );

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Send NFT" }));
    });

    await waitFor(() => {
      expect(mockSignAndSerializeTransaction).toHaveBeenCalled();
    });

    expect(mockSignNftTransfer).not.toHaveBeenCalled();
    expect(mockSafeTransferFrom).toHaveBeenCalled();
    expect(mockSignAndSerializeTransaction).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nonce: "0x2",
        to: defaultState.contractAddress,
        value: "0x0",
        data: "0x42842e0e",
      }),
      expect.anything(),
    );
    expect(mockAddTransaction).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        pendingStatus: "pending",
        tokenSymbol: "TestNFT",
        data: "0x42842e0e",
      }),
    );
  });
});
