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
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import AccountCreationSuccess from "./AccountCreationSuccess";

describe("AccountCreationSuccess", () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(cleanup);

  const renderComponent = (
    mockedStoreValues = mockedStore(),
    mockedProps: ComponentProps<typeof AccountCreationSuccess> = {
      account: {
        address: "Q00000000000000000000000000000000000000000000000000000000205046e6A6E159eD6ACedE46A36CAD6D449C80A100000000000000000000000000000000",
        seed: "",
        sign: (_data: Record<string, unknown> | string) => {
          return { messageHash: "", signature: "", message: "" };
        },
        signTransaction: async () => ({
          messageHash: "",
          rawTransaction: "",
          signature: "",
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
          <AccountCreationSuccess account={mockedProps.account} />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the account creation sucess component", () => {
    renderComponent();

    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "Account created",
    );
    expect(screen.getByText("Account public address:")).toBeInTheDocument();
    expect(
      screen.getByText("Q 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 00000 02050 46e6A 6E159 eD6AC edE46 A36CA D6D44 9C80A 10000 00000 00000 00000 00000 00000 000"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "You can share this account public address with anyone. Others need it to interact with you.",
      ),
    ).toBeInTheDocument();
    const copyButton = screen.getByRole("button", { name: "Copy" });
    const doneButton = screen.getByRole("button", { name: "Done" });
    expect(copyButton).toBeInTheDocument();
    expect(copyButton).toBeEnabled();
    expect(doneButton).toBeInTheDocument();
    expect(doneButton).toBeEnabled();
  });

  it("should copy the account address to clipboard", async () => {
    renderComponent();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const clipboardMock = vi.fn().mockResolvedValue(void 0 as never);
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: clipboardMock,
      },
      writable: true,
    });
    const copyButton = screen.getByRole("button", { name: "Copy" });
    expect(screen.getByText("Copy")).toBeInTheDocument();
    await user.click(copyButton);
    expect(screen.getByText("Copied")).toBeInTheDocument();
    vi.advanceTimersByTime(1000);
    expect(clipboardMock).toHaveBeenCalledTimes(1);
    expect(clipboardMock).toHaveBeenCalledWith(
      "Q00000000000000000000000000000000000000000000000000000000205046e6A6E159eD6ACedE46A36CAD6D449C80A100000000000000000000000000000000",
    );
  });
});
