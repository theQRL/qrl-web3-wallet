import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Receive from "./Receive";

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <div data-testid="qr-code" data-value={value} />
  ),
}));

const renderComponent = (
  mockedStoreValues = mockedStore(),
  locationState?: { accountAddress: string },
) =>
  render(
    <StoreProvider value={mockedStoreValues}>
      <MemoryRouter
        initialEntries={[{ pathname: "/receive", state: locationState }]}
      >
        <Receive />
      </MemoryRouter>
    </StoreProvider>,
  );

describe("Receive", () => {
  afterEach(cleanup);

  it("should render the Receive heading", () => {
    renderComponent();

    expect(screen.getByText("Receive")).toBeInTheDocument();
  });

  it("should render a QR code for the active account", () => {
    const address = "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000";
    renderComponent(
      mockedStore({
        qrlStore: { activeAccount: { accountAddress: address } },
      }),
    );

    const qr = screen.getByTestId("qr-code");
    expect(qr).toBeInTheDocument();
    expect(qr).toHaveAttribute("data-value", address);
  });

  it("should use accountAddress from location state when provided", () => {
    const stateAddress = "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000";
    renderComponent(mockedStore(), { accountAddress: stateAddress });

    const qr = screen.getByTestId("qr-code");
    expect(qr).toHaveAttribute("data-value", stateAddress);
  });

  it("should display the split address", () => {
    const address = "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000";
    renderComponent(
      mockedStore({
        qrlStore: { activeAccount: { accountAddress: address } },
      }),
    );

    // Address is rendered as "Q 00000 00000 ... 020B7 14091 ..." (prefix + space-separated chunks)
    expect(screen.getByText(/Q\s+00000\s+00000.*020B7\s+14091/)).toBeInTheDocument();
  });

  it("should copy address to clipboard on click", async () => {
    const address = "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000";
    const mockedWriteText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockedWriteText },
      writable: true,
    });

    renderComponent(
      mockedStore({
        qrlStore: { activeAccount: { accountAddress: address } },
      }),
    );

    const copyButton = screen.getByRole("button", { name: "Copy address" });
    await userEvent.click(copyButton);

    expect(mockedWriteText).toHaveBeenCalledWith(address);
  });
});
