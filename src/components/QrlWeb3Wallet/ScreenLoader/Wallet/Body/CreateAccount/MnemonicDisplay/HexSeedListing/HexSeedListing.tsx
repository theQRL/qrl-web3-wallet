import StringUtil from "@/utilities/stringUtil";
import { useTranslation } from "react-i18next";

type HexSeedListingProps = {
  hexSeed?: string;
};

const HexSeedListing = ({ hexSeed = "" }: HexSeedListingProps) => {
  const { t } = useTranslation();
  const { prefix, addressSplit } = StringUtil.getSplitAddress(hexSeed, 3);

  return (
    <div className="space-y-2">
      <div className="font-bold">{t('mnemonic.hexSeed')}</div>
      <div className="flex flex-wrap gap-1 text-secondary">
        {prefix}
        {addressSplit.map((segment, index) => (
          <span
            key={`${index}-${segment}`}
            className="transition-transform hover:scale-110 hover:font-bold"
          >
            {segment}
          </span>
        ))}
      </div>
    </div>
  );
};

export default HexSeedListing;
