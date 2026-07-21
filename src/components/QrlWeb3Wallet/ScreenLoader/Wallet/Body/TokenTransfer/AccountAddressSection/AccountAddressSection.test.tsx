import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AccountAddressSection from "./AccountAddressSection";

describe("AccountAddressSection", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <AccountAddressSection />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the account address section component", () => {
    renderComponent();

    expect(screen.getByText("Account address")).toBeInTheDocument();
    expect(
      screen.getByText("Q 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 08a8e AfB1C F62bF bEb17 41769 DaE1A 9dd47 99619 20000 00000 00000 00000 00000 00000 000"),
    ).toBeInTheDocument();
    expect(screen.getByText("Balance")).toBeInTheDocument();
    expect(screen.getByText("0.0 QRL")).toBeInTheDocument();
  });
});
