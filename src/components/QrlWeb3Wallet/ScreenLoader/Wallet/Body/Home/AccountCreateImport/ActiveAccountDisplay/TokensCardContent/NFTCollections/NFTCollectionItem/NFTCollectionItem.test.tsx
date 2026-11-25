import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import NFTCollectionItem from "./NFTCollectionItem";

const CONTRACT = `Q${"1f".repeat(64)}`;

const { mockClearFromNFTCollectionsList } = vi.hoisted(() => ({
  mockClearFromNFTCollectionsList: vi.fn(async () => {}),
}));

vi.mock("@/utilities/storageUtil", () => ({
  __esModule: true,
  default: {
    clearFromNFTCollectionsList: mockClearFromNFTCollectionsList,
  },
}));

const CurrentPath = () => <div data-testid="path">{useLocation().pathname}</div>;

describe("NFTCollectionItem", () => {
  afterEach(() => {
    cleanup();
    mockClearFromNFTCollectionsList.mockClear();
  });

  const renderComponent = (triggerReRender = vi.fn()) =>
    render(
      <StoreProvider
        value={mockedStore({
          qrlStore: {
            getNftCollectionDetails: vi.fn().mockResolvedValue({
              collection: { name: "Live", symbol: "LV", balance: 3 },
              error: "",
            }),
          },
        })}
      >
        <MemoryRouter initialEntries={["/"]}>
          <NFTCollectionItem
            contractAddress={CONTRACT}
            triggerReRender={triggerReRender}
          />
          <CurrentPath />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("opens the gallery when the row is clicked", async () => {
    renderComponent();

    await userEvent.click(await screen.findByText("Live"));
    expect(screen.getByTestId("path")).toHaveTextContent("/nft-gallery");
  });

  it("asks before removing and stays on the page when Remove Collection is chosen", async () => {
    const triggerReRender = vi.fn();
    renderComponent(triggerReRender);

    await screen.findByText("Live");
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove Collection" }),
    );

    expect(screen.getByTestId("path")).toHaveTextContent("/");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Remove 'Live' collection from wallet?");

    await userEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => {
      expect(mockClearFromNFTCollectionsList).toHaveBeenCalledWith(
        expect.any(String),
        CONTRACT,
      );
    });
    expect(triggerReRender).toHaveBeenCalledTimes(1);
  });
});
