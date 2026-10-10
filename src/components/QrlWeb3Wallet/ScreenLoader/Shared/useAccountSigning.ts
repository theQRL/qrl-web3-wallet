import {
  type DecryptedKeyType,
  LOCK_MANAGER_MESSAGES,
} from "@/scripts/lockManager/lockManager";
import AddressUtil from "@/utilities/addressUtil";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import browser from "webextension-polyfill";

export const useAccountSigning = (accountAddress: string) => {
  const { t } = useTranslation();
  const [checkedAccount, setCheckedAccount] = useState<{
    address: string;
    recoveryOnly?: boolean;
    error?: string;
  }>();
  const isLegacy = AddressUtil.isLegacyQrlAddress(accountAddress);

  useEffect(() => {
    if (isLegacy) return;
    let cancelled = false;
    browser.runtime
      .sendMessage({
        name: LOCK_MANAGER_MESSAGES.GET_DECRYPTED_KEYS,
      })
      .then(
        (keys: DecryptedKeyType[] | undefined) => {
          const key = keys?.find(
            (key) => key.address.toLowerCase() === accountAddress.toLowerCase(),
          );
          if (!cancelled) {
            setCheckedAccount({
              address: accountAddress,
              recoveryOnly: key?.recoveryOnly,
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
  }, [accountAddress, isLegacy]);

  const account =
    checkedAccount?.address === accountAddress ? checkedAccount : undefined;
  const signingError = isLegacy
    ? t("transfer.errorLegacyAccount")
    : account?.recoveryOnly
      ? t("transfer.errorRecoveryOnlyAccount")
      : account?.error !== undefined
        ? t("transfer.errorOccurred", { error: account.error })
        : "";

  return { signingError, canSign: !!account && !signingError };
};
