import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Web3 from "@theqrl/web3";
import { ExtendedSeed, Seed, newMLDSA87Descriptor } from "@theqrl/wallet.js";
import { TooltipProvider } from "@/components/UI/Tooltip";
import PersonalSign from "./PersonalSign";

vi.mock("@/scripts/utils/restrictedMethodsMiddlewareUtils", () => ({
  revalidateAuthorizedDAppRequest: vi.fn(async () => ({ canProceed: true })),
}));

// Throwaway seed, never used outside tests.
const web3 = new Web3();
const account = web3.qrl.accounts.seedToAccount(
  ExtendedSeed.newExtendedSeed(
    newMLDSA87Descriptor(),
    new Seed(Uint8Array.from({ length: 48 }, (_, i) => i + 1)),
  ).toBytes(),
);
const READABLE = "Sign in to evil.example as owner";
const READABLE_HEX = `0x${Buffer.from(READABLE).toString("hex")}`;

const approve = async (message: string) => {
  const signedHashes: string[] = [];
  const setOnPermissionCallBack = vi.fn();
  const addToResponseData = vi.fn();
  const store = mockedStore({
    lockStore: { getAccountSeed: vi.fn(async () => account.seed) },
    qrlStore: {
      qrlConnection: { isConnected: true },
      qrlInstance: {
        accounts: {
          seedToAccount: web3.qrl.accounts.seedToAccount.bind(
            web3.qrl.accounts,
          ),
          sign: (data: string, seed: string) => {
            const signed = web3.qrl.accounts.sign(data, seed);
            signedHashes.push(signed.messageHash);
            return signed;
          },
        } as never,
      },
    },
    dAppRequestStore: {
      dAppRequestData: { params: [message, account.address] },
      setOnPermissionCallBack,
      addToResponseData,
    },
  });
  const view = render(
    <StoreProvider value={store}>
      <MemoryRouter>
        <TooltipProvider>
          <PersonalSign />
        </TooltipProvider>
      </MemoryRouter>
    </StoreProvider>,
  );
  await waitFor(() => expect(setOnPermissionCallBack).toHaveBeenCalled());
  const shown = view.container.textContent ?? "";
  await setOnPermissionCallBack.mock.calls.at(-1)?.[0](true);
  return { shown, signedHash: signedHashes[0] };
};

describe("PersonalSign shows what it signs", () => {
  afterEach(cleanup);

  it("shows the decoded text of a hex message and signs that text", async () => {
    const { shown, signedHash } = await approve(READABLE_HEX);
    expect(shown).toContain(READABLE);
    expect(signedHash).toBe(web3.qrl.accounts.hashMessage(READABLE_HEX));
  });

  it.each([
    ["a leading", `\u0000${READABLE_HEX}`],
    ["a trailing", `${READABLE_HEX}\u0000`],
  ])(
    "shows a hex message with %s NUL as raw text and signs that raw text",
    async (_label, message) => {
      const { shown, signedHash } = await approve(message);
      expect(shown).toContain(READABLE_HEX);
      expect(shown).not.toContain(READABLE);
      expect(shown).toMatch(/not hex-encoded; displaying raw input/);
      expect(signedHash).toBe(web3.qrl.accounts.hashMessage(message));
      expect(signedHash).not.toBe(web3.qrl.accounts.hashMessage(READABLE_HEX));
    },
  );
});
