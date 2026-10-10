import { useStore } from "@/stores/store";
import StringUtil from "@/utilities/stringUtil";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

type AccountAddressSectionProps = {
  tokenBalance?: string;
};

const AccountAddressSection = observer(
  ({ tokenBalance }: AccountAddressSectionProps) => {
    const { t } = useTranslation();
    const { qrlStore } = useStore();
    const { activeAccount, getAccountBalance } = qrlStore;
    const { accountAddress } = activeAccount;

    const { prefix, addressSplit } = StringUtil.getSplitAddress(accountAddress);
    const tokenAccountBalance = tokenBalance
      ? tokenBalance
      : getAccountBalance(accountAddress);

    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <div>{t('transfer.accountAddress')}</div>
          <div className="font-bold text-secondary">{`${prefix} ${addressSplit.join(" ")}`}</div>
        </div>
        <div className="flex flex-col gap-1">
          <div>{t('transfer.balance')}</div>
          <div className="font-bold text-secondary">
            {tokenAccountBalance === "Unavailable"
              ? t("common.unavailable")
              : tokenAccountBalance}
          </div>
        </div>
      </div>
    );
  },
);

export default AccountAddressSection;
