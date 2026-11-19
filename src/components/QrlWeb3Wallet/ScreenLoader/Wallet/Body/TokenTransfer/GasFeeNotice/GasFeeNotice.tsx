import { formatFiatCompact } from "@/functions/formatFiat";
import { getOptimalGasFee } from "@/functions/getOptimalGasFee";
import { useStore } from "@/stores/store";
import type { GasFeeOverrides } from "@/types/gasFee";
import { cva } from "class-variance-authority";
import { Loader } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type GasFeeNoticeProps = {
  isQrc20Token: boolean;
  tokenContractAddress: string;
  tokenDecimals: number;
  from: string;
  to: string;
  value: number;
  isSubmitting: boolean;
  onGasFeeCalculated?: (gasFee: string) => void;
  overrides?: GasFeeOverrides;
};

const gasFeeNoticeClasses = cva(
  "m-1 flex justify-around rounded-lg border border-white px-4 py-2",
  {
    variants: {
      isSubmitting: {
        true: ["opacity-30"],
        false: ["opacity-80"],
      },
    },
    defaultVariants: {
      isSubmitting: false,
    },
  },
);

export const GasFeeNotice = observer(
  ({
    isQrc20Token,
    tokenContractAddress,
    tokenDecimals,
    from,
    to,
    value,
    isSubmitting,
    onGasFeeCalculated,
    overrides,
  }: GasFeeNoticeProps) => {
    const { t } = useTranslation();
    const { qrlStore, priceStore, settingsStore } = useStore();
    const { getNativeTokenGas, getQrc20TokenGas } = qrlStore;

    const hasValuesForGasCalculation = !!from && !!to && !!value;

    const [gasFee, setGasFee] = useState({
      estimatedGas: "",
      rawAmount: "",
      isLoading: true,
      error: "",
    });

    const calculateNativeTokenGas = async () => {
      return await getNativeTokenGas(overrides);
    };

    const calculateQrc20TokenGas = async () => {
      return await getQrc20TokenGas(
        from,
        to,
        value,
        tokenContractAddress,
        tokenDecimals,
        overrides,
      );
    };

    const calculateGasFee = async () => {
      setGasFee({ ...gasFee, isLoading: true, error: "" });
      try {
        const gasFeeAmount = await (isQrc20Token
          ? calculateQrc20TokenGas()
          : calculateNativeTokenGas());
        setGasFee({
          ...gasFee,
          estimatedGas: getOptimalGasFee(gasFeeAmount),
          rawAmount: gasFeeAmount,
          error: "",
          isLoading: false,
        });
        onGasFeeCalculated?.(gasFeeAmount);
      } catch (error) {
        setGasFee({ ...gasFee, error: `${error}`, isLoading: false });
        onGasFeeCalculated?.("");
      }
    };

    useEffect(() => {
      calculateGasFee();
    }, [from, to, value, overrides]);

    const { showBalanceAndPrice, currency } = settingsStore;
    const qrlPrice = priceStore.getPrice(currency);
    const fiatGas =
      showBalanceAndPrice && qrlPrice > 0 && gasFee.rawAmount
        ? formatFiatCompact(gasFee.rawAmount, qrlPrice, currency)
        : "";

    return (
      hasValuesForGasCalculation && (
        <div className={gasFeeNoticeClasses({ isSubmitting })}>
          {gasFee.isLoading ? (
            <div className="flex gap-2">
              <Loader className="h-4 w-4 animate-spin" />
              {t('gasFee.estimating')}
            </div>
          ) : gasFee.error ? (
            <div>{gasFee.error}</div>
          ) : (
            <div className="w-full overflow-hidden">
              {t('gasFee.estimated', { amount: gasFee?.estimatedGas })}
              {fiatGas && (
                <span className="ml-1 text-muted-foreground">{fiatGas}</span>
              )}
            </div>
          )}
        </div>
      )
    );
  },
);
