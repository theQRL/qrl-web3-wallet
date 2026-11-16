import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AllQRC20Tokens from "./AllQRC20Tokens";

vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Home/AccountCreateImport/ActiveAccountDisplay/TokensCardContent/QRC20Tokens/QRC20Tokens",
  () => ({ default: () => <div>Mocked QRC-20 tokens</div> }),
);

describe("AllQRC20Tokens", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <AllQRC20Tokens />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the all QRC-20 tokens component", () => {
    renderComponent();

    expect(screen.getByText("All QRC-20 tokens")).toBeInTheDocument();
    expect(screen.getByText("Mocked QRC-20 tokens")).toBeInTheDocument();
  });
});
