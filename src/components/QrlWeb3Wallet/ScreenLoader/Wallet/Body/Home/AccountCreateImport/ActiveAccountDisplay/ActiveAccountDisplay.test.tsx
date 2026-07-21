import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActiveAccountDisplay from "./ActiveAccountDisplay";

describe("ActiveAccountDisplay", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <ActiveAccountDisplay />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the active account details", () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          activeAccount: {
            accountAddress: "Q00000000000000000000000000000000000000000000000000000000205046e6A6E159eD6ACedE46A36CAD6D449C80A100000000000000000000000000000000",
          },
          getAccountBalance: (_accountAddress: string) => {
            return "2.45 QRL";
          },
        },
      }),
    );

    expect(screen.getByText("2.45 QRL")).toBeInTheDocument();
    expect(
      screen.getByText("Q 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 02050 46e6A 6E159 eD6AC edE46 A36CA D6D44 9C80A 10000 00000 00000 00000 00000 00000 000"),
    ).toBeInTheDocument();
  });
});
