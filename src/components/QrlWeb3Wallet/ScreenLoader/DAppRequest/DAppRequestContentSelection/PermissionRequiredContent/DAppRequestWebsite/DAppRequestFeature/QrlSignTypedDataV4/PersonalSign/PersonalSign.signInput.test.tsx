import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/UI/Tooltip";
import PersonalSign from "./PersonalSign";

vi.mock("@/scripts/utils/restrictedMethodsMiddlewareUtils", () => ({
  revalidateAuthorizedDAppRequest: vi.fn(async () => ({ canProceed: true })),
}));

const fromAddress = `Q${"ab".repeat(64)}`;

describe("PersonalSign signing input", () => {
  afterEach(cleanup);

  it.each([
    ["a text message with NUL edges", "\u0000hello\u0000", "hello"],
    ["a hex message", "0x1234", "0x1234"],
  ])("signs %s as the 1.x wallet did", async (_label, message, expected) => {
    const sign = vi.fn(() => ({ signature: "0xsignature" }));
    const setOnPermissionCallBack = vi.fn();
    const addToResponseData = vi.fn();
    const store = mockedStore({
      lockStore: { getAccountSeed: vi.fn(async () => "seed") },
      qrlStore: {
        qrlConnection: { isConnected: true },
        qrlInstance: {
          accounts: {
            seedToAccount: () => ({ address: fromAddress }),
            sign,
          } as never,
        },
      },
      dAppRequestStore: {
        dAppRequestData: { params: [message, fromAddress] },
        setOnPermissionCallBack,
        addToResponseData,
      },
    });
    render(
      <StoreProvider value={store}>
        <MemoryRouter>
          <TooltipProvider>
            <PersonalSign />
          </TooltipProvider>
        </MemoryRouter>
      </StoreProvider>,
    );
    await waitFor(() => expect(setOnPermissionCallBack).toHaveBeenCalled());
    const onPermission = setOnPermissionCallBack.mock.calls.at(-1)?.[0];
    await onPermission(true);

    expect(sign).toHaveBeenCalledWith(expected, "seed");
  });
});
