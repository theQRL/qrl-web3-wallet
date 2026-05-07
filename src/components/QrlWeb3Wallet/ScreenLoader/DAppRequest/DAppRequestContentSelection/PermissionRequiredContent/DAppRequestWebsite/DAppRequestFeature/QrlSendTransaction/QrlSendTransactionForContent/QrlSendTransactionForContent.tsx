import { Button } from "@/components/UI/Button";
import { Label } from "@/components/UI/Label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/UI/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/UI/Tooltip";
import { getHexSeedFromMnemonic } from "@/functions/getHexSeedFromMnemonic";
import { useStore } from "@/stores/store";
import type { TransactionHistoryEntry } from "@/types/transactionHistory";
import StringUtil from "@/utilities/stringUtil";
import { Copy } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { SEND_TRANSACTION_TYPES } from "../QrlSendTransaction";
import { utils, qrl } from "@theqrl/web3";

type DAppTransactionReceipt = {
  transactionHash?: string;
  blockNumber?: bigint | string | number;
  gasUsed?: bigint | string | number;
  effectiveGasPrice?: bigint | string | number;
  status?: bigint | string | number;
};

const { Common } = qrl.accounts;

type TransactionObject = {
  from: string;
  to?: string;
  data?: string;
  gas: string;
  value?: string;
  nonce: bigint | undefined;
  type?: string;
  maxPriorityFeePerGas?: bigint;
  maxFeePerGas?: string;
  gasPrice?: bigint | undefined;
};

type QrlSendTransactionForContentProps = {
  transactionType: keyof typeof SEND_TRANSACTION_TYPES;
};

const QrlSendTransactionForContent = observer(
  ({ transactionType }: QrlSendTransactionForContentProps) => {
    const { t } = useTranslation();
    const {
      lockStore,
      qrlStore,
      dAppRequestStore,
      ledgerStore,
      transactionHistoryStore,
    } = useStore();
    const { getMnemonicPhrases } = lockStore;
    const { qrlInstance, getGasFeeData, qrlConnection } = qrlStore;
    const { isConnected, blockchain } = qrlConnection;
    const {
      dAppRequestData,
      setOnPermissionCallBack,
      setCanProceed,
      addToResponseData,
    } = dAppRequestStore;

    const params = dAppRequestData?.params[0];
    const accountFromAddress = params?.from;
    const { prefix: prefixFrom, addressSplit: addressSplitFrom } =
      StringUtil.getSplitAddress(accountFromAddress);
    const accountToAddress = params?.to;
    const { prefix: prefixTo, addressSplit: addressSplitTo } =
      StringUtil.getSplitAddress(accountToAddress);
    const value = BigInt(params?.value ?? 0);
    const gasLimit = BigInt(params?.gas ?? 0);
    const data = params?.data;

    useEffect(() => {
      if (isConnected) {
        const onPermissionCallBack = async (hasApproved: boolean) => {
          if (hasApproved) {
            if (transactionType === SEND_TRANSACTION_TYPES.QRL_TRANSFER) {
              await sendZndTransfer();
            } else {
              await deployContractOrInteract();
            }
          }
        };
        setOnPermissionCallBack(onPermissionCallBack);
      }
    }, [isConnected, transactionType]);

    const copyData = () => {
      navigator.clipboard.writeText(data);
    };

    const recordTransactionHistory = async ({
      from,
      to,
      value,
      data,
      receipt,
      isQrlTransfer,
    }: {
      from: string;
      to?: string;
      value?: string | bigint | number;
      data?: string;
      receipt: DAppTransactionReceipt;
      isQrlTransfer: boolean;
    }) => {
      const transactionHash = receipt?.transactionHash;
      if (!transactionHash) return;
      try {
        const isSuccess = receipt.status?.toString() === "1";
        const tokenSymbol = blockchain?.nativeCurrency?.symbol ?? "QRL";
        const tokenName = blockchain?.nativeCurrency?.name ?? tokenSymbol;
        const valueAsBigInt =
          value !== undefined && value !== null
            ? typeof value === "bigint"
              ? value
              : BigInt(value)
            : 0n;
        const amount = isQrlTransfer
          ? Number(utils.fromPlanck(valueAsBigInt, "quanta"))
          : 0;
        const entry: TransactionHistoryEntry = {
          id: transactionHash,
          from,
          to: to ?? "",
          amount,
          tokenSymbol,
          tokenName,
          isZrc20Token: false,
          tokenContractAddress: "",
          tokenDecimals: 18,
          transactionHash,
          blockNumber: receipt.blockNumber?.toString() ?? "",
          gasUsed: receipt.gasUsed?.toString() ?? "",
          effectiveGasPrice: (receipt.effectiveGasPrice ?? 0).toString(),
          status: isSuccess,
          timestamp: Date.now(),
          chainId: blockchain?.chainId ?? "",
          pendingStatus: isSuccess ? "confirmed" : "failed",
          data: data ?? undefined,
        };
        await transactionHistoryStore.addTransaction(from, entry);
      } catch (error) {
        console.error(
          "QrlWeb3Wallet: Failed to record dApp transaction in history",
          error,
        );
      }
    };

    const deployContractOrInteract = async () => {
      const request = dAppRequestData?.params?.[0];
      try {
        const { from, to, data, gas, type, value } = request;

        const isLedgerAccount = ledgerStore.isLedgerAccount(from ?? "");

        const gasPrice = await qrlInstance?.getGasPrice();
        const transactionObject: TransactionObject = {
          from,
          ...(to && { to }),
          data,
          gas,
          value,
          nonce: await qrlInstance?.getTransactionCount(from),
        };
        if (type === "0x2") {
          const { maxFeePerGas, maxPriorityFeePerGas } = await getGasFeeData();
          transactionObject.type = "0x2";
          transactionObject.maxPriorityFeePerGas = maxPriorityFeePerGas;
          transactionObject.maxFeePerGas = `0x${maxFeePerGas.toString(16)}`;
        } else {
          transactionObject.gasPrice = gasPrice;
        }

        let rawTransactionToSend: string | undefined;

        if (isLedgerAccount) {
          const chainId = await qrlInstance?.getChainId();
          const common = Common.custom({ chainId: Number(chainId) });

          const txData: Record<string, unknown> = {
            nonce: `0x${transactionObject.nonce?.toString(16)}`,
            gasLimit: transactionObject.gas,
            data: transactionObject.data || "0x",
            value: transactionObject.value ? `0x${BigInt(transactionObject.value).toString(16)}` : "0x0",
          };

          if (transactionObject.to) {
            txData.to = transactionObject.to;
          }

          if (transactionObject.type === "0x2") {
            txData.maxPriorityFeePerGas = transactionObject.maxPriorityFeePerGas;
            txData.maxFeePerGas = transactionObject.maxFeePerGas;
          } else {
            txData.gasPrice = `0x${BigInt(transactionObject.gasPrice ?? 0).toString(16)}`;
          }

          rawTransactionToSend = await ledgerStore.signAndSerializeTransaction(from ?? "", txData, common);
        } else {
          // Regular account - use mnemonic-based signing
          const mnemonicPhrases = await getMnemonicPhrases(from ?? "");
          const signedTransaction = await qrlInstance?.accounts.signTransaction(
            transactionObject,
            getHexSeedFromMnemonic(mnemonicPhrases),
          );
          rawTransactionToSend = signedTransaction?.rawTransaction;
        }

        if (rawTransactionToSend) {
          const transactionReceipt = await qrlInstance?.sendSignedTransaction(
            rawTransactionToSend,
          );
          addToResponseData({
            transactionHash: transactionReceipt?.transactionHash,
          });
          if (from && transactionReceipt) {
            await recordTransactionHistory({
              from,
              to,
              value,
              data,
              receipt: transactionReceipt as DAppTransactionReceipt,
              isQrlTransfer: false,
            });
          }
        } else {
          throw new Error("Transaction could not be signed");
        }
      } catch (error) {
        addToResponseData({ error });
        console.error(
          transactionType === SEND_TRANSACTION_TYPES.CONTRACT_DEPLOYMENT
            ? "Contract deployment failed:"
            : "Contract interaction failed:",
          error,
        );
      }
    };

    const sendZndTransfer = async () => {
      const request = dAppRequestData?.params?.[0];
      try {
        const { from, to, gas, type, value } = request;

        if (!from) {
          throw new Error(
            "Sender address ('from') is missing for QRL transfer.",
          );
        }
        if (!to) {
          throw new Error(
            "Recipient address ('to') is missing for QRL transfer.",
          );
        }
        if (!gas) {
          throw new Error("Gas limit ('gas') is missing for QRL transfer.");
        }
        if (value === undefined || value === null) {
          throw new Error(
            "Transfer amount ('value') is missing for QRL transfer.",
          );
        }

        const isLedgerAccount = ledgerStore.isLedgerAccount(from);

        const gasPrice = await qrlInstance?.getGasPrice();
        const transactionObject: TransactionObject = {
          from,
          to,
          gas,
          value,
          nonce: await qrlInstance?.getTransactionCount(from),
        };

        if (type === "0x2") {
          const { maxFeePerGas, maxPriorityFeePerGas } = await getGasFeeData();
          transactionObject.type = "0x2";
          transactionObject.maxPriorityFeePerGas = maxPriorityFeePerGas;
          transactionObject.maxFeePerGas = `0x${maxFeePerGas.toString(16)}`;
        } else {
          transactionObject.gasPrice = gasPrice;
        }

        let rawTransactionToSend: string | undefined;

        if (isLedgerAccount) {
          const chainId = await qrlInstance?.getChainId();
          const common = Common.custom({ chainId: Number(chainId) });

          const txData = {
            nonce: `0x${transactionObject.nonce?.toString(16)}`,
            maxPriorityFeePerGas: transactionObject.maxPriorityFeePerGas,
            maxFeePerGas: transactionObject.maxFeePerGas,
            gasLimit: transactionObject.gas,
            to: transactionObject.to,
            value: `0x${BigInt(transactionObject.value ?? 0).toString(16)}`,
            data: "0x",
          };

          rawTransactionToSend = await ledgerStore.signAndSerializeTransaction(from, txData, common);
        } else {
          // Regular account - use mnemonic-based signing
          const mnemonicPhrases = await getMnemonicPhrases(from ?? "");
          const signedTransaction = await qrlInstance?.accounts.signTransaction(
            transactionObject,
            getHexSeedFromMnemonic(mnemonicPhrases),
          );
          rawTransactionToSend = signedTransaction?.rawTransaction;
        }

        if (rawTransactionToSend) {
          const transactionReceipt = await qrlInstance?.sendSignedTransaction(
            rawTransactionToSend,
          );
          addToResponseData({
            transactionHash: transactionReceipt?.transactionHash,
          });
          if (from && transactionReceipt) {
            await recordTransactionHistory({
              from,
              to,
              value,
              receipt: transactionReceipt as DAppTransactionReceipt,
              isQrlTransfer: true,
            });
          }
        } else {
          throw new Error("QRL Transfer transaction could not be signed");
        }
      } catch (error) {
        addToResponseData({ error });
        console.error("QRL Transfer failed:", error);
      }
    };
    useEffect(() => {
      setCanProceed(true);
    }, []);

    return (
      <Tabs defaultValue="details" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger
            value="details"
            className="w-full data-[state=active]:text-secondary"
          >
            {t('dapp.sendTransaction.tabDetails')}
          </TabsTrigger>
          {transactionType !== SEND_TRANSACTION_TYPES.QRL_TRANSFER && (
            <TabsTrigger
              value="data"
              className="w-full data-[state=active]:text-secondary"
            >
              {t('dapp.sendTransaction.tabData')}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="details" className="rounded-md p-2">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <div>{t('dapp.sendTransaction.fromAddress')}</div>
              <div className="w-64 font-bold text-secondary">{`${prefixFrom} ${addressSplitFrom.join(" ")}`}</div>
            </div>
            {(transactionType === SEND_TRANSACTION_TYPES.CONTRACT_INTERACTION ||
              transactionType === SEND_TRANSACTION_TYPES.QRL_TRANSFER) && (
              <div className="flex flex-col gap-1">
                <div>
                  {transactionType ===
                  SEND_TRANSACTION_TYPES.CONTRACT_INTERACTION
                    ? t('dapp.sendTransaction.contractAddress')
                    : t('dapp.sendTransaction.toAddress')}
                </div>
                <div className="w-64 font-bold text-secondary">{`${prefixTo} ${addressSplitTo.join(" ")}`}</div>
              </div>
            )}
            {(transactionType === SEND_TRANSACTION_TYPES.QRL_TRANSFER ||
              value > 0n) && (
              <div className="flex flex-col gap-1">
                <div>{t('dapp.sendTransaction.value')}</div>
                <div className="font-bold text-secondary">
                  {utils.fromPlanck(value, "quanta")} QRL
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <div>{t('dapp.sendTransaction.gasLimit')}</div>
              <div className="font-bold text-secondary">
                {gasLimit.toString()}
              </div>
            </div>
          </div>
        </TabsContent>
        {transactionType !== SEND_TRANSACTION_TYPES.QRL_TRANSFER && (
          <TabsContent value="data" className="rounded-md p-2">
            <div className="flex flex-col gap-1">
              <div>{t('dapp.sendTransaction.data')}</div>
              <div className="flex gap-2">
                <div className="max-h-[8rem] w-full overflow-hidden break-words font-bold text-secondary">
                  {data}
                </div>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-7 w-8 hover:text-secondary"
                      variant="outline"
                      size="icon"
                      onClick={copyData}
                    >
                      <Copy size="16" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <Label>{t('dapp.sendTransaction.copyData')}</Label>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>
    );
  },
);

export default QrlSendTransactionForContent;
