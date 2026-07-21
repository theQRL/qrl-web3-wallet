import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NFTDetail from "./NFTDetail";

const defaultState = {
  contractAddress: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
  tokenId: "42",
  collectionName: "TestCollection",
  metadata: {
    name: "Cool NFT #42",
    description: "A very cool NFT",
    image: "ipfs://QmImage",
    attributes: [
      { trait_type: "Color", value: "Blue" },
      { trait_type: "Rarity", value: "Legendary" },
    ],
  },
  imageUrl: "https://ipfs.io/ipfs/QmImage",
};

describe("NFTDetail", () => {
  afterEach(cleanup);

  const renderComponent = (
    state = defaultState,
    mockedStoreValues = mockedStore(),
  ) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter
          initialEntries={[{ pathname: "/nft-detail", state }]}
        >
          <NFTDetail />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render NFT name from metadata", () => {
    renderComponent();
    expect(screen.getByText("Cool NFT #42")).toBeInTheDocument();
  });

  it("should render description", () => {
    renderComponent();
    expect(screen.getByText("A very cool NFT")).toBeInTheDocument();
  });

  it("should render collection name", () => {
    renderComponent();
    expect(screen.getByText("TestCollection")).toBeInTheDocument();
  });

  it("should render token ID", () => {
    renderComponent();
    expect(screen.getByText("#42")).toBeInTheDocument();
  });

  it("should render attributes", () => {
    renderComponent();
    expect(screen.getByText("Color")).toBeInTheDocument();
    expect(screen.getByText("Blue")).toBeInTheDocument();
    expect(screen.getByText("Rarity")).toBeInTheDocument();
    expect(screen.getByText("Legendary")).toBeInTheDocument();
  });

  it("should render image when imageUrl is provided", () => {
    renderComponent();
    const img = screen.getByAltText("Cool NFT #42");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://ipfs.io/ipfs/QmImage");
  });

  it("should render send NFT button", () => {
    renderComponent();
    expect(screen.getByText("Send NFT")).toBeInTheDocument();
  });

  it("should show fallback name when no metadata", () => {
    renderComponent({
      ...defaultState,
      metadata: null as any,
      imageUrl: "",
    });
    expect(screen.getByText("TestCollection #42")).toBeInTheDocument();
  });

  it("should have a back button", () => {
    renderComponent();
    expect(screen.getByTestId("backButtonTestId")).toBeInTheDocument();
  });
});
