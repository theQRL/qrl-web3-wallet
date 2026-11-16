import { Input } from "@/components/UI/Input";
import { Label } from "@/components/UI/Label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/UI/Tooltip";
import { NATIVE_TOKEN_UNITS_OF_GAS } from "@/constants/nativeToken";
import { formatFiatCompact } from "@/functions/formatFiat";
import { getOptimalGasFee } from "@/functions/getOptimalGasFee";
import { useStore } from "@/stores/store";
import type { GasFeeOverrides, GasTier } from "@/types/gasFee";
import { cn } from "@/utilities/stylingUtil";
import { ChevronDown, ChevronUp, Info, Loader } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type GasFeeSelectorProps = {
  isQrc20Token: boolean;
  tokenContractAddress: string;
  tokenDecimals: number;
  from: string;
  to: string;
  value: number;
  disabled?: boolean;
  onOverridesChange: (overrides: GasFeeOverrides) => void;
  onGasFeeCalculated?: (gasFee: string) => void;
};

type TierConfig = {
  value: GasTier;
  label: string;
  description: string;
};

export const GasFeeSelector = observer(
  ({
    isQrc20Token,
    tokenContractAddress,
    tokenDecimals,
    from,
    to,
    value,
    disabled,
    onOverridesChange,
    onGasFeeCalculated,
  }: GasFeeSelectorProps) => {
    const { t } = useTranslation();
    const { settingsStore, qrlStore, priceStore } = useStore();

    const TIERS: TierConfig[] = useMemo(() => [
      {
        value: "low" as GasTier,
        label: t('gasFee.tierLow'),
        description: t('gasFee.tierLowDescription'),
      },
      {
        value: "market" as GasTier,
        label: t('gasFee.tierMarket'),
        description: t('gasFee.tierMarketDescription'),
      },
      {
        value: "aggressive" as GasTier,
        label: t('gasFee.tierAggressive'),
        description: t('gasFee.tierAggressiveDescription'),
      },
    ], [t]);
    const { defaultGasTier, showBalanceAndPrice, currency } = settingsStore;
    const qrlPrice = priceStore.getPrice(currency);
    const { getNativeTokenGas, getQrc20TokenGas } = qrlStore;

    const initialTier =
      defaultGasTier === "advanced" ? "market" : defaultGasTier;

    const [selectedTier, setSelectedTier] = useState<GasTier>(initialTier);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [advancedValues, setAdvancedValues] = useState({
      maxPriorityFeePerGas: "",
      maxFeePerGas: "",
      gasLimit: "",
    });

    const [tierCosts, setTierCosts] = useState<Record<string, string>>({});
    const [isLoadingCosts, setIsLoadingCosts] = useState(true);

    const hasValuesForGasCalculation = !!from && !!to && !!value;

    const calculateGasForTier = useCallback(
      async (tier: GasTier): Promise<string> => {
        const overrides: GasFeeOverrides = { tier };
        if (isQrc20Token) {
          return await getQrc20TokenGas(
            from,
            to,
            value,
            tokenContractAddress,
            tokenDecimals,
            overrides,
          );
        }
        return await getNativeTokenGas(overrides);
      },
      [
        from,
        to,
        value,
        isQrc20Token,
        tokenContractAddress,
        tokenDecimals,
        getNativeTokenGas,
        getQrc20TokenGas,
      ],
    );

    useEffect(() => {
      if (!hasValuesForGasCalculation) return;

      let cancelled = false;
      setIsLoadingCosts(true);

      (async () => {
        try {
          const results = await Promise.all(
            TIERS.map(async (tier) => {
              const cost = await calculateGasForTier(tier.value);
              return [tier.value, cost] as const;
            }),
          );
          if (!cancelled) {
            const costs: Record<string, string> = {};
            for (const [tierValue, cost] of results) {
              costs[tierValue] = cost;
            }
            setTierCosts(costs);
            setIsLoadingCosts(false);

            // Report the cost for the currently selected tier
            if (!showAdvanced) {
              onGasFeeCalculated?.(costs[selectedTier] ?? "");
            }
          }
        } catch {
          if (!cancelled) {
            setIsLoadingCosts(false);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [from, to, value, hasValuesForGasCalculation, calculateGasForTier]);

    const buildOverrides = useCallback(
      (
        tier: GasTier,
        advanced = advancedValues,
      ): GasFeeOverrides => {
        if (tier === "advanced") {
          return {
            tier: "advanced",
            maxPriorityFeePerGas: advanced.maxPriorityFeePerGas
              ? BigInt(advanced.maxPriorityFeePerGas)
              : undefined,
            maxFeePerGas: advanced.maxFeePerGas
              ? BigInt(advanced.maxFeePerGas)
              : undefined,
            gasLimit: advanced.gasLimit
              ? Number(advanced.gasLimit)
              : undefined,
          };
        }
        return { tier };
      },
      [advancedValues],
    );

    const selectTier = (tier: GasTier) => {
      setSelectedTier(tier);
      setShowAdvanced(false);
      const overrides = buildOverrides(tier);
      onOverridesChange(overrides);
      onGasFeeCalculated?.(tierCosts[tier] ?? "");
    };

    const toggleAdvanced = async () => {
      if (showAdvanced) {
        // Collapse — revert to selected tier
        const overrides = buildOverrides(selectedTier);
        onOverridesChange(overrides);
        onGasFeeCalculated?.(tierCosts[selectedTier] ?? "");
        setShowAdvanced(false);
      } else {
        // Expand — pre-fill with current Market values
        try {
          const { maxPriorityFeePerGas, maxFeePerGas } =
            await qrlStore.getGasFeeData({ tier: "market" });
          const prefilled = {
            maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
            maxFeePerGas: maxFeePerGas.toString(),
            gasLimit: String(NATIVE_TOKEN_UNITS_OF_GAS),
          };
          setAdvancedValues(prefilled);
          const overrides = buildOverrides("advanced", prefilled);
          onOverridesChange(overrides);
        } catch {
          const overrides = buildOverrides("advanced");
          onOverridesChange(overrides);
        }
        onGasFeeCalculated?.("");
        setShowAdvanced(true);
      }
    };

    const handleAdvancedChange = (
      field: keyof typeof advancedValues,
      rawValue: string,
    ) => {
      const sanitized = rawValue.replace(/[^0-9]/g, "");
      const updated = { ...advancedValues, [field]: sanitized };
      setAdvancedValues(updated);
      const overrides = buildOverrides("advanced", updated);
      onOverridesChange(overrides);
    };

    if (!hasValuesForGasCalculation) return null;

    return (
      <TooltipProvider delayDuration={200}>
        <div className="m-1">
          <Label className="mb-2 block text-xs text-muted-foreground">
            {t('gasFee.label')}
          </Label>
          <div className="flex flex-col gap-1">
            {TIERS.map((tier) => {
              const isSelected = !showAdvanced && selectedTier === tier.value;
              const cost = tierCosts[tier.value];

              return (
                <button
                  key={tier.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectTier(tier.value)}
                  className={cn(
                    "flex items-center justify-between rounded-md border px-3 py-2 text-left transition-all",
                    "hover:border-secondary/50",
                    isSelected
                      ? "border-secondary bg-secondary/10"
                      : "border-border",
                    disabled && "pointer-events-none opacity-50",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        isSelected ? "bg-secondary" : "bg-muted-foreground/30",
                      )}
                    />
                    <div>
                      <div className="text-sm font-medium">{tier.label}</div>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-52 text-xs">
                        {tier.description}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex flex-col items-end text-right text-xs text-muted-foreground">
                    {isLoadingCosts ? (
                      <Loader className="h-3 w-3 animate-spin" />
                    ) : cost ? (
                      <>
                        <span>{getOptimalGasFee(cost)}</span>
                        {showBalanceAndPrice && qrlPrice > 0 && (
                          <span className="text-[10px]">
                            {formatFiatCompact(cost, qrlPrice, currency)}
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                </button>
              );
            })}

            {/* Advanced toggle */}
            <button
              type="button"
              disabled={disabled}
              onClick={toggleAdvanced}
              className={cn(
                "flex items-center justify-between rounded-md border px-3 py-2 text-left transition-all",
                "hover:border-secondary/50",
                showAdvanced
                  ? "border-secondary bg-secondary/10"
                  : "border-border",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-2 w-2 rounded-full",
                    showAdvanced ? "bg-secondary" : "bg-muted-foreground/30",
                  )}
                />
                <div className="text-sm font-medium">{t('gasFee.tierAdvanced')}</div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-52 text-xs">
                    {t('gasFee.tierAdvancedDescription')}
                  </TooltipContent>
                </Tooltip>
              </div>
              {showAdvanced ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showAdvanced && (
              <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">
                    {t('gasFee.maxPriorityFee')}
                  </Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder={t('gasFee.placeholderAuto')}
                    value={advancedValues.maxPriorityFeePerGas}
                    onChange={(e) =>
                      handleAdvancedChange(
                        "maxPriorityFeePerGas",
                        e.target.value,
                      )
                    }
                    disabled={disabled}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">
                    {t('gasFee.maxFee')}
                  </Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder={t('gasFee.placeholderAuto')}
                    value={advancedValues.maxFeePerGas}
                    onChange={(e) =>
                      handleAdvancedChange("maxFeePerGas", e.target.value)
                    }
                    disabled={disabled}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">
                    {t('gasFee.gasLimit')}
                  </Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder={t('gasFee.placeholderAuto')}
                    value={advancedValues.gasLimit}
                    onChange={(e) =>
                      handleAdvancedChange("gasLimit", e.target.value)
                    }
                    disabled={disabled}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </TooltipProvider>
    );
  },
);
