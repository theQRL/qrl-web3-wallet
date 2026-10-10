import { useStore } from "@/stores/store";
import AddressUtil from "@/utilities/addressUtil";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export const useAccountSigning = (accountAddress: string) => {
  const { t } = useTranslation();
  const { lockStore } = useStore();
  const { getAccountSigningStatus } = lockStore;
  const [checkedAccount, setCheckedAccount] = useState<{
    address: string;
    recoveryOnly?: boolean;
    error?: string;
  }>();
  const isLegacy = AddressUtil.isLegacyQrlAddress(accountAddress);

  useEffect(() => {
    let cancelled = false;
    getAccountSigningStatus(accountAddress).then(
      (status) => {
        if (!cancelled) {
          setCheckedAccount({
            address: accountAddress,
            recoveryOnly: status.recoveryOnly,
          });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setCheckedAccount({
            address: accountAddress,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [accountAddress, getAccountSigningStatus]);

  const account =
    checkedAccount?.address === accountAddress ? checkedAccount : undefined;
  const signingError = account?.recoveryOnly
    ? t("transfer.errorRecoveryOnlyAccount")
    : account?.error !== undefined
      ? t("transfer.errorOccurred", { error: account.error })
      : account && isLegacy
        ? t("transfer.errorLegacyAccount")
        : "";

  return { signingError, canSign: !!account && !signingError };
};
