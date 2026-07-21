import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AccountAddressDisplay from "./AccountAddressDisplay";

describe("AccountAddressDisplay", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <AccountAddressDisplay />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the account address display component", () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q00000000000000000000000000000000000000000000000000000000208318ecd68f26726CE7C54b29CaBA94584969B600000000000000000000000000000000",
          },
        },
      }),
    );

    expect(screen.getByText("Account address")).toBeInTheDocument();
    expect(
      screen.getByText("Q 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 02083 18ecd 68f26 726CE 7C54b 29CaB A9458 4969B 60000 00000 00000 00000 00000 00000 000"),
    ).toBeInTheDocument();
  });
});
