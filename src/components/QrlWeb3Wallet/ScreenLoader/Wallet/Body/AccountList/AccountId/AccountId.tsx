import { formatFiatCompact } from "@/functions/formatFiat";
import { parseBalanceValue } from "@/functions/parseBalanceValue";
import { useStore } from "@/stores/store";
import StringUtil from "@/utilities/stringUtil";
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
  const { prefix, addressSplit } = StringUtil.getSplitAddress(account);

  const [accountBalance, setAccountBalance] = useState("");
  const isLedgerAccount = ledgerStore.isLedgerAccount(account);
  const label = accountLabelsStore.getLabel(account);

  useEffect(() => {
    setAccountBalance(getAccountBalance(account));
  }, [accounts]);

  const numericBalance = parseBalanceValue(accountBalance).toNumber();
  const price = priceStore.getPrice(settingsStore.currency);
  const fiatDisplay =
    settingsStore.showBalanceAndPrice && price > 0
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
          <div className="flex flex-wrap gap-1">
            <div className="text-xs">
              {prefix}
              {addressSplit[0]}
            </div>
            {addressSplit.slice(1).map((part, index) => (
              <div className="text-xs" key={`${index}-${part}`}>
                {part}
              </div>
            ))}
          </div>
          {(hideLabel || !label) && isLedgerAccount && (
            <span title={t('account.ledger')}>
              <Usb className="h-3 w-3 text-muted-foreground" />
            </span>
          )}
        </div>
        <div className="text-xs text-secondary">
          {accountBalance}
          {fiatDisplay && (
            <span className="ml-1 text-muted-foreground">{fiatDisplay}</span>
          )}
        </div>
      </div>
    </div>
  );
});

export default AccountId;
