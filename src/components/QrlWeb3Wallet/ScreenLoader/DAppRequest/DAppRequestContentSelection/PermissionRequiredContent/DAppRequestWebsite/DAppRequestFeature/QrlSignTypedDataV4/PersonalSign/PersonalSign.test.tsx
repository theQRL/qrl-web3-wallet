import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/UI/Tooltip";
import PersonalSign from "./PersonalSign";

describe("PersonalSign", () => {
  afterEach(cleanup);

  const message =
    "0x506c65617365207369676e2074686973206d65737361676520746f20636f6e6669726d20796f7572206964656e746974792e";
  const fromAddress = "Q0000000000000000000000000000000000000000000000000000000020D20b8026B8F02540246f58120ddAAf35AECD9B00000000000000000000000000000000";

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <TooltipProvider>
            <PersonalSign />
          </TooltipProvider>
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the personal sign component", () => {
    const expectedMessage =
      "Please sign this message to confirm your identity.";
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: {
            params: [message, fromAddress],
          },
        },
      }),
    );

    expect(screen.getByText("From Address")).toBeInTheDocument();
    expect(
      screen.getByText("Q 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 020D2 0b802 6B8F0 25402 46f58 120dd AAf35 AECD9 B0000 00000 00000 00000 00000 00000 000"),
    ).toBeInTheDocument();
    expect(screen.getByText("Message")).toBeInTheDocument();
    expect(screen.getByText(expectedMessage)).toBeInTheDocument();
    const copyButton = screen.getByRole("button", { name: "Copy message" });
    expect(copyButton).toBeInTheDocument();
    expect(copyButton).toBeEnabled();
  });

  it("should copy the message to clipboard", async () => {
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: {
            params: [message, fromAddress],
          },
        },
      }),
    );
    const clipboardMock = vi.fn().mockResolvedValue(void 0 as never);
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: clipboardMock,
      },
      writable: true,
    });
    const copyButton = screen.getByRole("button", { name: "Copy message" });
    await userEvent.click(copyButton);
    expect(clipboardMock).toHaveBeenCalledTimes(1);
    expect(clipboardMock).toHaveBeenCalledWith(
      "Please sign this message to confirm your identity.",
    );
  });
});
