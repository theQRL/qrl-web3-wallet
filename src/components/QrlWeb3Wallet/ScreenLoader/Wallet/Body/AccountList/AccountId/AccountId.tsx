import { formatFiatCompact } from "@/functions/formatFiat";
import { parseBalanceValue } from "@/functions/parseBalanceValue";
import { BALANCE_UNAVAILABLE } from "@/stores/qrlStore";
import { useStore } from "@/stores/store";
import FullAddress from "@/components/QrlWeb3Wallet/ScreenLoader/Shared/FullAddress/FullAddress";
import { Usb } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type AccountIdType = {
  account: string;
  hideLabel?: boolean;
};

const AccountId = observer(({ account, hideLabel }: AccountIdType) => {
  const { t } = useTranslation();
  const { qrlStore, ledgerStore, accountLabelsStore, priceStore, settingsStore } = useStore();
  const { getAccountBalance, qrlAccounts } = qrlStore;
  const { accounts } = qrlAccounts;

  const [accountBalance, setAccountBalance] = useState("");
  const isLedgerAccount = ledgerStore.isLedgerAccount(account);
  const label = accountLabelsStore.getLabel(account);

  useEffect(() => {
    setAccountBalance(getAccountBalance(account));
  }, [accounts]);

  const numericBalance = parseBalanceValue(accountBalance).toNumber();
  const price = priceStore.getPrice(settingsStore.currency);
  const fiatDisplay =
    settingsStore.showBalanceAndPrice &&
    price > 0 &&
    accountBalance !== BALANCE_UNAVAILABLE
      ? formatFiatCompact(numericBalance, price, settingsStore.currency)
      : "";

  return (
    <div className="flex flex-col gap-1">
      {!hideLabel && label && (
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium">{label}</span>
          {isLedgerAccount && (
            <span title={t('account.ledger')}>
              <Usb className="h-3 w-3 text-muted-foreground" />
            </span>
          )}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <FullAddress address={account} className="gap-1 text-xs" />
          {(hideLabel || !label) && isLedgerAccount && (
            <span title={t('account.ledger')}>
              <Usb className="h-3 w-3 text-muted-foreground" />
            </span>
          )}
        </div>
        <div className="text-xs text-secondary">
          {accountBalance === BALANCE_UNAVAILABLE
            ? t("common.unavailable")
            : accountBalance}
          {fiatDisplay && (
            <span className="ml-1 text-muted-foreground">{fiatDisplay}</span>
          )}
        </div>
      </div>
    </div>
  );
});

export default AccountId;
