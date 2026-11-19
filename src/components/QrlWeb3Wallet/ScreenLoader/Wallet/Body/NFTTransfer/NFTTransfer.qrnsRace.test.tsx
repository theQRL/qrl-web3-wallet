import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import NFTTransfer from "./NFTTransfer";

const lookups = vi.hoisted(() => new Map<string, (address: string) => void>());

vi.mock("@/utilities/qrnsResolver", () => ({
  isQrnsName: (input: string) => /^[a-z0-9.-]+\.qrl$/i.test(input.trim()),
  resolveQrnsName: vi.fn(
    (name: string) =>
      new Promise<string>((resolve) => {
        lookups.set(name, resolve);
      }),
  ),
}));

vi.mock("@/utilities/storageUtil", () => ({
  __esModule: true,
  default: {
    getActiveBlockChain: async () => ({ chainId: "0x1" }),
  },
}));

const ALICE = `Q${"aa".repeat(64)}`;
const BOB = `Q${"bb".repeat(64)}`;
const state = {
  contractAddress: `Q${"cd".repeat(64)}`,
  tokenId: "7",
  collectionName: "TestNFT",
  imageUrl: "https://example.com/nft.png",
  nftName: "Cool Token #7",
};

describe("NFTTransfer QRNS resolution", () => {
  afterEach(() => {
    cleanup();
    lookups.clear();
  });

  it("ignores a slow lookup for a name that is no longer in the field", async () => {
    const signNftTransfer = vi.fn(async () => ({
      error: "stop here",
    }));
    const store = mockedStore({
      lockStore: { getAccountSeed: vi.fn(async () => "seed") },
      qrlStore: { signNftTransfer },
    });
    render(
      <StoreProvider value={store}>
        <MemoryRouter initialEntries={[{ pathname: "/nft-transfer", state }]}>
          <NFTTransfer />
        </MemoryRouter>
      </StoreProvider>,
    );
    const user = userEvent.setup();
    const receiver = screen.getByRole("textbox", { name: "receiverAddress" });
    await user.click(receiver);
    await user.paste("alice.qrl");
    await waitFor(
      () => {
        expect(lookups.has("alice.qrl")).toBe(true);
      },
      { timeout: 3000 },
    );

    await user.clear(receiver);
    await user.paste("bob.qrl");
    await act(async () => {
      lookups.get("alice.qrl")?.(ALICE);
    });

    expect(screen.queryByText(`→ ${ALICE}`)).not.toBeInTheDocument();
    const send = screen.getByRole("button", { name: "Send NFT" });
    expect(send).toBeDisabled();

    await waitFor(
      () => {
        expect(lookups.has("bob.qrl")).toBe(true);
      },
      { timeout: 3000 },
    );
    await act(async () => {
      lookups.get("bob.qrl")?.(BOB);
    });
    await waitFor(() => expect(send).toBeEnabled());
    await act(async () => {
      await user.click(send);
    });
    await waitFor(() => {
      expect(signNftTransfer).toHaveBeenCalledTimes(1);
    });
    const args = signNftTransfer.mock.calls[0] as unknown as unknown[];
    expect(args[1]).toBe(BOB);
  }, 20000);
});
