import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NFTGallery from "./NFTGallery";

vi.mock("./NFTGalleryItem", () => {
  const MockNFTGalleryItem = ({ tokenId }: { tokenId: string }) => (
    <div data-testid={`gallery-item-${tokenId}`}>Token #{tokenId}</div>
  );
  MockNFTGalleryItem.displayName = "MockNFTGalleryItem";
  return { __esModule: true, default: MockNFTGalleryItem };
});

const state = {
  contractAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
  collectionName: "TestCollection",
};

describe("NFTGallery", () => {
  afterEach(cleanup);

  const renderComponent = (
    overrides = {},
    routeState = state,
  ) =>
    render(
      <StoreProvider value={mockedStore(overrides)}>
        <MemoryRouter
          initialEntries={[{ pathname: "/nft-gallery", state: routeState }]}
        >
          <NFTGallery />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render collection name as title", async () => {
    renderComponent({
      qrlStore: {
        getOwnedNftTokenIds: vi.fn<any>().mockResolvedValue([]),
      },
    });

    expect(screen.getByText("TestCollection")).toBeInTheDocument();
  });

  it("should show empty state when no tokens owned", async () => {
    renderComponent({
      qrlStore: {
        getOwnedNftTokenIds: vi.fn<any>().mockResolvedValue([]),
      },
    });

    await waitFor(() => {
      expect(screen.getByText("No NFTs found in this collection. The contract may not support token enumeration.")).toBeInTheDocument();
    });
  });

  it("should render gallery items for owned tokens", async () => {
    renderComponent({
      qrlStore: {
        getOwnedNftTokenIds: vi
          .fn<any>()
          .mockResolvedValue(["1", "2", "3"]),
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("gallery-item-1")).toBeInTheDocument();
      expect(screen.getByTestId("gallery-item-2")).toBeInTheDocument();
      expect(screen.getByTestId("gallery-item-3")).toBeInTheDocument();
    });
  });

  it("should have a back button", async () => {
    renderComponent({
      qrlStore: {
        getOwnedNftTokenIds: vi.fn<any>().mockResolvedValue([]),
      },
    });

    expect(screen.getByTestId("backButtonTestId")).toBeInTheDocument();
  });
});
