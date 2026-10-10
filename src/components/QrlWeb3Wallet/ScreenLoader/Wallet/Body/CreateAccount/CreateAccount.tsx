import { Alert, AlertDescription } from "@/components/UI/Alert";
import withSuspense from "@/functions/withSuspense";
import { useStore } from "@/stores/store";
import { Web3BaseWalletAccount } from "@theqrl/web3";
import { observer } from "mobx-react-lite";
import { lazy, useState } from "react";
import { useTranslation } from "react-i18next";
import StartAccountCreation from "./StartAccountCreation/StartAccountCreation";
import AccountCreationSuccess from "./AccountCreationSuccess/AccountCreationSuccess";
import CircuitBackground from "../../../Shared/CircuitBackground/CircuitBackground";

const MnemonicDisplay = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/CreateAccount/MnemonicDisplay/MnemonicDisplay"
      ),
  ),
);

const CreateAccount = observer(() => {
  const { t } = useTranslation();
  const { lockStore, qrlStore } = useStore();
  const { encryptAccount, getWalletPassword } = lockStore;
  const { setActiveAccount } = qrlStore;

  const [account, setAccount] = useState<Web3BaseWalletAccount>();
  const [hasAccountCreated, setHasAccountCreated] = useState(false);
  const [hasMnemonicNoted, setHasMnemonicNoted] = useState(false);
  const [finalizeError, setFinalizeError] = useState("");

  const onAccountCreated = async (account?: Web3BaseWalletAccount) => {
    window.scrollTo(0, 0);
    if (account) {
      // Fail closed before touching storage: the wallet can read as
      // unlocked (its decrypted keys self-healed from session storage
      // after a service-worker restart) while the memory-only wallet
      // password is gone. Checking it first means a spent session never
      // gets as far as setActiveAccount, so the new account is never left
      // pointing at a keystore that was never written.
      let password: string;
      try {
        password = await getWalletPassword();
      } catch {
        setFinalizeError(t("account.passwordUnavailable"));
        return;
      }
      setAccount(account);
      try {
        await encryptAccount(account, password);
      } catch {
        setFinalizeError(t("account.passwordUnavailable"));
        return;
      }
      await setActiveAccount(account?.address);
      setFinalizeError("");
      setHasAccountCreated(true);
    }
  };

  const onMnemonicNoted = () => {
    window.scrollTo(0, 0);
    setHasMnemonicNoted(true);
  };

  return (
    <>
      <CircuitBackground />
      <div className="relative z-10 w-full p-8">
        {hasAccountCreated ? (
          hasMnemonicNoted ? (
            <AccountCreationSuccess account={account} />
          ) : (
            <MnemonicDisplay
              account={account}
              onMnemonicNoted={onMnemonicNoted}
            />
          )
        ) : (
          <>
            {finalizeError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{finalizeError}</AlertDescription>
              </Alert>
            )}
            <StartAccountCreation onAccountCreated={onAccountCreated} />
          </>
        )}
      </div>
    </>
  );
});

export default CreateAccount;
