import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NFTGalleryItem from "./NFTGalleryItem";

const { mockFetchMetadata } = vi.hoisted(() => ({
  mockFetchMetadata: vi.fn(),
}));

vi.mock("@/utilities/ipfsUtil", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utilities/ipfsUtil")>()),
  fetchMetadata: mockFetchMetadata,
}));

describe("NFTGalleryItem", () => {
  afterEach(() => {
    cleanup();
    mockFetchMetadata.mockReset();
  });

  const renderItem = () =>
    render(
      <StoreProvider
        value={mockedStore({
          qrlStore: {
            getNftTokenUri: vi.fn().mockResolvedValue("https://example.com/1"),
          },
        })}
      >
        <MemoryRouter>
          <NFTGalleryItem
            contractAddress="Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000"
            tokenId="7"
            collectionName="Col"
          />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("shows the name and image of well-formed metadata", async () => {
    mockFetchMetadata.mockResolvedValue({
      name: "Seven",
      image: "https://example.com/7.png",
    });
    renderItem();

    await waitFor(() => {
      expect(screen.getByText("Seven")).toBeInTheDocument();
    });
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.com/7.png",
    );
  });

  it("falls back to the token id when the name is not a string", async () => {
    mockFetchMetadata.mockResolvedValue({
      name: { first: "Seven" },
      image: 7,
    });
    renderItem();

    await waitFor(() => {
      expect(screen.getByText("#7")).toBeInTheDocument();
    });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
