import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Transaction } from "@theqrl/web3";
import { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import MnemonicDisplay from "./MnemonicDisplay";

describe("MnemonicDisplay", () => {
  afterEach(cleanup);

  const mockedOnMnemonicNoted = vi.fn();
  const renderComponent = (
    mockedStoreValues = mockedStore(),
    mockedProps: ComponentProps<typeof MnemonicDisplay> = {
      onMnemonicNoted: mockedOnMnemonicNoted,
      account: {
        address: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
        seed: "0x7819dc0205e6a5c286796886ce16e637b99e1838701cc6988c5886ddc890a7f328771d9197fd17f36faa759d9b8c4c42",
        sign: (data: string | Record<string, unknown>) => ({
          messageHash: data.toString(),
          signature: data.toString(),
        }),
        signTransaction: async (tx: Transaction) => ({
          messageHash: "",
          signature: "",
          rawTransaction: tx.value?.toString() ?? "",
          transactionHash: "",
        }),
        encrypt: async () => {
          throw new Error("Not implemented");
        },
      },
    },
  ) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <MnemonicDisplay {...mockedProps} />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the mnemonic display component", () => {
    renderComponent();

    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "Keep this safe",
    );
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Don't lose this mnemonic phrases. Download it right now. You may need this someday to import or recover your new account Q00000 ... 00000",
    );
    const downloadButton = screen.getByRole("button", { name: "Download" });
    expect(downloadButton).toBeInTheDocument();
    expect(downloadButton).toBeEnabled();
    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeInTheDocument();
    expect(continueButton).toBeEnabled();
  });

  it("should display the warning dialog asking to download the mnemonic phrases", async () => {
    renderComponent();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await act(async () => {
      await userEvent.click(continueButton);
    });
    expect(
      screen.getByText(
        "It is highly recommended that you continue after downloading the recovery mnemonic phrases. If you already have, please continue.",
      ),
    ).toBeInTheDocument();
    const confirmContinueButton = screen.getByRole("button", {
      name: "Continue",
    });
    const mockedMnemonicNotedFunction = vi.fn();
    confirmContinueButton.onclick = mockedMnemonicNotedFunction;
    await act(async () => {
      await userEvent.click(confirmContinueButton);
    });
    expect(mockedMnemonicNotedFunction).toHaveBeenCalledTimes(1);
  });

  it("should download the mnemonic phrases on clicking the download button", async () => {
    renderComponent();

    const mockedCreateObjectURLFunction = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      value: mockedCreateObjectURLFunction,
      writable: true,
    });
    const mockedRevokeObjectURLFunction = vi.fn();
    Object.defineProperty(URL, "revokeObjectURL", {
      value: mockedRevokeObjectURLFunction,
      writable: true,
    });
    const downloadButton = screen.getByRole("button", { name: "Download" });
    await act(async () => {
      await userEvent.click(downloadButton);
    });
    expect(mockedCreateObjectURLFunction).toBeCalledTimes(1);
    expect(mockedRevokeObjectURLFunction).toBeCalledTimes(1);
  });
});
