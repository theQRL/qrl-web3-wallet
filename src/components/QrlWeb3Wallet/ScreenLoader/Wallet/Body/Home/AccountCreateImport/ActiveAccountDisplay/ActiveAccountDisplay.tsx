import { formatFiatCompact } from "@/functions/formatFiat";
import { parseBalanceValue } from "@/functions/parseBalanceValue";
import { useStore } from "@/stores/store";
import StringUtil from "@/utilities/stringUtil";
import { TrendingDown, TrendingUp } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

const ActiveAccountDisplay = observer(() => {
  const { t } = useTranslation();
  const { qrlStore, priceStore, settingsStore } = useStore();
  const { activeAccount, getAccountBalance } = qrlStore;
  const { accountAddress } = activeAccount;
  const { showBalanceAndPrice, currency } = settingsStore;

  const accountBalance = getAccountBalance(accountAddress);
  const { prefix, addressSplit } = StringUtil.getSplitAddress(accountAddress);

  const numericBalance = parseBalanceValue(accountBalance).toNumber();
  const price = priceStore.getPrice(currency);
  const fiatDisplay =
    showBalanceAndPrice && price > 0 && accountBalance !== "Unavailable"
      ? formatFiatCompact(numericBalance, price, currency)
      : "";
  const change24h = priceStore.getChange24h(currency);
  const showChange = showBalanceAndPrice && price > 0 && change24h !== 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex animate-appear-in text-2xl font-bold text-secondary">
          {accountBalance === "Unavailable"
            ? t("common.unavailable")
            : accountBalance}
        </div>
        {fiatDisplay && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{fiatDisplay}</span>
            {showChange && (
              <span
                className={`flex items-center gap-0.5 text-xs ${change24h >= 0 ? "text-green-500" : "text-red-500"}`}
              >
                {change24h >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {Math.abs(change24h).toFixed(2)}%
              </span>
            )}
          </div>
        )}
      </div>
      <div className="text-sm">{`${prefix} ${addressSplit.join(" ")}`}</div>
    </div>
  );
});

export default ActiveAccountDisplay;
