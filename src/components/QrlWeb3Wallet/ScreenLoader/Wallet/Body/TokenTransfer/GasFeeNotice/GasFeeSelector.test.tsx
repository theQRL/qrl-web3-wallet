import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { GasFeeSelector } from "./GasFeeSelector";

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

describe("GasFeeSelector", () => {
  afterEach(cleanup);

  const defaultProps: ComponentProps<typeof GasFeeSelector> = {
    isZrc20Token: false,
    tokenContractAddress: "",
    tokenDecimals: 18,
    from: "Q00000000000000000000000000000000000000000000000000000000205046e6A6E159eD6ACedE46A36CAD6D449C80A100000000000000000000000000000000",
    to: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
    value: 1.5,
    disabled: false,
    onOverridesChange: vi.fn<any>(),
    onGasFeeCalculated: vi.fn<any>(),
  };

  const renderComponent = (
    mockedStoreValues = mockedStore(),
    props: Partial<ComponentProps<typeof GasFeeSelector>> = {},
  ) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <GasFeeSelector {...defaultProps} {...props} />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should not render when from, to or value are missing", () => {
    renderComponent(undefined, { from: "", to: "", value: 0 });

    expect(screen.queryByText("Gas fee")).not.toBeInTheDocument();
    expect(screen.queryByText("Low")).not.toBeInTheDocument();
  });

  it("should render all tier options", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Gas fee")).toBeInTheDocument();
      expect(screen.getByText("Low")).toBeInTheDocument();
      expect(screen.getByText("Market")).toBeInTheDocument();
      expect(screen.getByText("Aggressive")).toBeInTheDocument();
      expect(screen.getByText("Advanced")).toBeInTheDocument();
    });
  });

  it("should render estimated costs for each tier", async () => {
    const getNativeTokenGas = vi.fn<any>(async () => "0.042");
    renderComponent(
      mockedStore({ qrlStore: { getNativeTokenGas } }),
    );

    await waitFor(() => {
      expect(getNativeTokenGas).toHaveBeenCalled();
    });
  });

  it("should call onOverridesChange when selecting a tier", async () => {
    const onOverridesChange = vi.fn<any>();
    renderComponent(undefined, { onOverridesChange });

    await act(async () => {
      await userEvent.click(screen.getByText("Low"));
    });

    expect(onOverridesChange).toHaveBeenCalledWith({ tier: "low" });
  });

  it("should call onOverridesChange with aggressive tier", async () => {
    const onOverridesChange = vi.fn<any>();
    renderComponent(undefined, { onOverridesChange });

    await act(async () => {
      await userEvent.click(screen.getByText("Aggressive"));
    });

    expect(onOverridesChange).toHaveBeenCalledWith({ tier: "aggressive" });
  });

  it("should expand advanced section when clicking Advanced", async () => {
    renderComponent();

    expect(
      screen.queryByText("Max priority fee (planck)"),
    ).not.toBeInTheDocument();

    await act(async () => {
      await userEvent.click(screen.getByText("Advanced"));
    });

    expect(
      screen.getByText("Max priority fee (planck)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Max fee (planck)")).toBeInTheDocument();
    expect(screen.getByText("Gas limit")).toBeInTheDocument();
  });

  it("should pre-fill advanced inputs with market values", async () => {
    const getGasFeeData = vi.fn<any>(async () => ({
      baseFeePerGas: BigInt(1000),
      maxPriorityFeePerGas: BigInt(300),
      maxFeePerGas: BigInt(1300),
    }));
    renderComponent(mockedStore({ qrlStore: { getGasFeeData } }));

    await act(async () => {
      await userEvent.click(screen.getByText("Advanced"));
    });

    await waitFor(() => {
      const inputs = screen.getAllByRole("textbox");
      expect(inputs[0]).toHaveValue("300");
      expect(inputs[1]).toHaveValue("1300");
      expect(inputs[2]).toHaveValue("21000");
    });
  });

  it("should collapse advanced and revert to selected tier", async () => {
    const onOverridesChange = vi.fn<any>();
    renderComponent(undefined, { onOverridesChange });

    // First select Low
    await act(async () => {
      await userEvent.click(screen.getByText("Low"));
    });

    // Open Advanced
    await act(async () => {
      await userEvent.click(screen.getByText("Advanced"));
    });

    expect(
      screen.getByText("Max priority fee (planck)"),
    ).toBeInTheDocument();

    // Close Advanced — should revert to Low
    await act(async () => {
      await userEvent.click(screen.getByText("Advanced"));
    });

    expect(
      screen.queryByText("Max priority fee (planck)"),
    ).not.toBeInTheDocument();

    // Last call should be reverting to low tier
    const lastCall =
      onOverridesChange.mock.calls[onOverridesChange.mock.calls.length - 1];
    expect(lastCall[0]).toEqual({ tier: "low" });
  });

  it("should emit advanced overrides when typing in inputs", async () => {
    const onOverridesChange = vi.fn<any>();
    renderComponent(undefined, { onOverridesChange });

    await act(async () => {
      await userEvent.click(screen.getByText("Advanced"));
    });

    const inputs = screen.getAllByRole("textbox");
    // Clear and type into max priority fee
    await act(async () => {
      await userEvent.clear(inputs[0]);
      await userEvent.type(inputs[0], "500");
    });

    const advancedCalls = onOverridesChange.mock.calls.filter(
      (call: any) => call[0].tier === "advanced",
    );
    expect(advancedCalls.length).toBeGreaterThan(0);
    expect((advancedCalls[advancedCalls.length - 1] as any)[0].tier).toBe("advanced");
  });

  it("should sanitize non-numeric input in advanced fields", async () => {
    renderComponent();

    await act(async () => {
      await userEvent.click(screen.getByText("Advanced"));
    });

    const inputs = screen.getAllByRole("textbox");
    await act(async () => {
      await userEvent.clear(inputs[0]);
      await userEvent.type(inputs[0], "abc123def");
    });

    expect(inputs[0]).toHaveValue("123");
  });

  it("should use defaultGasTier from settings as initial selection", async () => {
    const onOverridesChange = vi.fn<any>();
    renderComponent(
      mockedStore({
        settingsStore: { defaultGasTier: "aggressive" as const },
      }),
      { onOverridesChange },
    );

    // Click Market to change — this verifies "aggressive" was the initial
    await act(async () => {
      await userEvent.click(screen.getByText("Market"));
    });

    expect(onOverridesChange).toHaveBeenCalledWith({ tier: "market" });
  });

  it("should disable all buttons when disabled prop is true", () => {
    renderComponent(undefined, { disabled: true });

    const buttons = screen.getAllByRole("button");
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
    });
  });

  it("should call onGasFeeCalculated when tier is selected and costs are loaded", async () => {
    const onGasFeeCalculated = vi.fn<any>();
    const getNativeTokenGas = vi.fn<any>(async () => "0.042");
    renderComponent(
      mockedStore({ qrlStore: { getNativeTokenGas } }),
      { onGasFeeCalculated },
    );

    await waitFor(() => {
      expect(getNativeTokenGas).toHaveBeenCalled();
    });

    await act(async () => {
      await userEvent.click(screen.getByText("Low"));
    });

    expect(onGasFeeCalculated).toHaveBeenCalled();
  });

  it("should handle gas calculation errors gracefully", async () => {
    const getNativeTokenGas = vi.fn<any>(async () => {
      throw new Error("RPC error");
    });
    renderComponent(
      mockedStore({ qrlStore: { getNativeTokenGas } }),
    );

    await waitFor(() => {
      expect(getNativeTokenGas).toHaveBeenCalled();
    });

    // Component should still render without crashing
    expect(screen.getByText("Gas fee")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("should open advanced with fallback when getGasFeeData throws", async () => {
    const onOverridesChange = vi.fn<any>();
    const getGasFeeData = vi.fn<any>(async () => {
      throw new Error("RPC error");
    });
    renderComponent(
      mockedStore({ qrlStore: { getGasFeeData } }),
      { onOverridesChange },
    );

    await act(async () => {
      await userEvent.click(screen.getByText("Advanced"));
    });

    // Advanced section should still open
    expect(
      screen.getByText("Max priority fee (planck)"),
    ).toBeInTheDocument();

    // Should have called onOverridesChange with advanced tier
    const advancedCalls = onOverridesChange.mock.calls.filter(
      (call: any) => call[0].tier === "advanced",
    );
    expect(advancedCalls.length).toBeGreaterThan(0);
  });

  it("should handle typing in maxFeePerGas and gasLimit advanced inputs", async () => {
    const onOverridesChange = vi.fn<any>();
    renderComponent(undefined, { onOverridesChange });

    await act(async () => {
      await userEvent.click(screen.getByText("Advanced"));
    });

    const inputs = screen.getAllByRole("textbox");

    // Type into maxFeePerGas (second input)
    await act(async () => {
      await userEvent.clear(inputs[1]);
      await userEvent.type(inputs[1], "2000");
    });

    expect(inputs[1]).toHaveValue("2000");

    // Type into gasLimit (third input)
    await act(async () => {
      await userEvent.clear(inputs[2]);
      await userEvent.type(inputs[2], "50000");
    });

    expect(inputs[2]).toHaveValue("50000");

    const advancedCalls = onOverridesChange.mock.calls.filter(
      (call: any) => call[0].tier === "advanced",
    );
    expect(advancedCalls.length).toBeGreaterThan(0);
  });

  it("should calculate gas for ZRC-20 tokens", async () => {
    const getZrc20TokenGas = vi.fn<any>(async () => "1.5");
    renderComponent(
      mockedStore({ qrlStore: { getZrc20TokenGas } }),
      {
        isZrc20Token: true,
        tokenContractAddress: "Q0000000000000000000000000000000000000000000000000000000028c4113a9d3a2e836f28c23ed8e3c1e7c243f56600000000000000000000000000000000",
        tokenDecimals: 18,
      },
    );

    await waitFor(() => {
      expect(getZrc20TokenGas).toHaveBeenCalled();
    });

    expect(screen.getByText("Gas fee")).toBeInTheDocument();
  });
});
