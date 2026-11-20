import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import type { Web3BaseWalletAccount } from "@theqrl/web3";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Onboarding, {
  ONBOARDING_STEPS,
  type OnboardingStepType,
} from "./Onboarding";

// The steps around the one under test, cut down to a button each.
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Lock/LockPassword/Onboarding/Welcome/Welcome",
  () => ({
    default: ({
      selectStep,
    }: {
      selectStep: (step: OnboardingStepType) => void;
    }) => (
      <button
        onClick={() => {
          selectStep(ONBOARDING_STEPS.ADD_OR_IMPORT_ACCOUNT);
        }}
      >
        to the account step
      </button>
    ),
  }),
);
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/Lock/LockPassword/Onboarding/AddOrImportAccount/AddOrImportAccount",
  () => ({
    default: ({
      addAnAccountToWallet,
    }: {
      addAnAccountToWallet: (account: Web3BaseWalletAccount) => Promise<void>;
    }) => (
      <button
        onClick={() => {
          addAnAccountToWallet({
            address: "Qnew",
            seed: "0x01",
          } as Web3BaseWalletAccount).catch(() => undefined);
        }}
      >
        store the account
      </button>
    ),
  }),
);

describe("Onboarding, the step that stores the first account", () => {
  afterEach(cleanup);

  const storeTheAccount = async (
    encryptAccount: () => Promise<void>,
    setOnboarding: (isOnboarding: boolean) => void,
  ) => {
    render(
      <StoreProvider
        value={mockedStore({
          lockStore: { encryptAccount, setOnboarding },
          qrlStore: { setActiveAccount: async () => undefined },
        })}
      >
        <MemoryRouter>
          <Onboarding />
        </MemoryRouter>
      </StoreProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "to the account step" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "store the account" }),
    );
  };

  it("holds the onboarding on screen from the moment this page stores the account", async () => {
    const order: string[] = [];
    const setOnboarding = vi.fn((isOnboarding: boolean) => {
      order.push(`onboarding ${String(isOnboarding)}`);
    });
    const encryptAccount = vi.fn(async () => {
      order.push("account stored");
    });

    await storeTheAccount(encryptAccount, setOnboarding);

    // Before the keystore is written, which is when the wallet starts to
    // read as unlocked.
    expect(order).toEqual(["onboarding true", "account stored"]);
  });

  it("lets go again when the account could not be stored", async () => {
    const setOnboarding = vi.fn();
    const encryptAccount = vi.fn(async () => {
      throw new Error("The account could not be stored");
    });

    await storeTheAccount(encryptAccount, setOnboarding);

    expect(setOnboarding.mock.calls).toEqual([[true], [false]]);
  });
});
