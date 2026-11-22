import { useStore } from "@/stores/store";
import { Web3BaseWalletAccount } from "@theqrl/web3";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import AddOrImportAccount from "./AddOrImportAccount/AddOrImportAccount";
import LockPasswordSetup from "./LockPasswordSetup/LockPasswordSetup";
import OnboardingCompleted from "./OnboardingCompleted/OnboardingCompleted";
import Welcome from "./Welcome/Welcome";

export const ONBOARDING_STEPS = Object.freeze({
  WELCOME: "WELCOME",
  SET_PASSWORD: "SET_PASSWORD",
  ADD_OR_IMPORT_ACCOUNT: "ADD_OR_IMPORT_ACCOUNT",
  COMPLETED: "COMPLETED",
});

export type OnboardingStepType =
  (typeof ONBOARDING_STEPS)[keyof typeof ONBOARDING_STEPS];

const Onboarding = observer(() => {
  const { lockStore, qrlStore } = useStore();
  const { encryptAccount } = lockStore;
  const { setActiveAccount } = qrlStore;

  const [step, setStep] = useState<OnboardingStepType>(
    ONBOARDING_STEPS.WELCOME,
  );
  const [password, setPassword] = useState("");

  const selectStep = (step: OnboardingStepType) => {
    setStep(step);
  };

  const setNewPassword = (password: string) => {
    setPassword(password);
  };

  const addAnAccountToWallet = async (account: Web3BaseWalletAccount) => {
    setActiveAccount(account.address);
    // From here this page is creating the wallet. The wallet reads as
    // unlocked once its first keystore is written, which is before the user
    // has downloaded the recovery phrases, so the page holds the onboarding
    // on screen until its completed step. A page that has not come this far
    // gives way to a wallet that another page creates.
    lockStore.setOnboarding(true);
    try {
      await encryptAccount(account, password);
    } catch (error) {
      lockStore.setOnboarding(false);
      throw error;
    }
  };

  if (step === ONBOARDING_STEPS.WELCOME)
    return <Welcome selectStep={selectStep} />;

  if (step === ONBOARDING_STEPS.SET_PASSWORD)
    return (
      <LockPasswordSetup
        selectStep={selectStep}
        setNewPassword={setNewPassword}
      />
    );

  if (step === ONBOARDING_STEPS.ADD_OR_IMPORT_ACCOUNT)
    return (
      <AddOrImportAccount
        selectStep={selectStep}
        addAnAccountToWallet={addAnAccountToWallet}
      />
    );

  if (step === ONBOARDING_STEPS.COMPLETED) return <OnboardingCompleted />;
});

export default Onboarding;
