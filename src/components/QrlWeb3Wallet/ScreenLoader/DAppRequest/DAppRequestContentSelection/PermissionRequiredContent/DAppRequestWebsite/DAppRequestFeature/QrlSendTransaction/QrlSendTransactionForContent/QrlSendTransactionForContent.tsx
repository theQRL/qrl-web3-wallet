import { Button } from "@/components/UI/Button";
import { Label } from "@/components/UI/Label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/UI/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/UI/Tooltip";
import { useStore } from "@/stores/store";
import type { TransactionHistoryEntry } from "@/types/transactionHistory";
import StringUtil from "@/utilities/stringUtil";
import { Copy } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { SEND_TRANSACTION_TYPES } from "../QrlSendTransaction";
import { utils, qrl } from "@theqrl/web3";
import { revalidateAuthorizedDAppRequest } from "@/scripts/utils/restrictedMethodsMiddlewareUtils";

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
    const { getAccountSeed } = lockStore;
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
            const authorization = await revalidateAuthorizedDAppRequest(
              dAppRequestData,
            );
            if (!authorization.canProceed) {
              addToResponseData({ error: authorization.proceedError });
              return;
            }
            if (transactionType === SEND_TRANSACTION_TYPES.QRL_TRANSFER) {
              await sendZndTransfer();
            } else {
              await deployContractOrInteract();
            }
          }
        };
        setOnPermissionCallBack(onPermissionCallBack);
      }
      }, [isConnected, transactionType, dAppRequestData]);

    const copyData = () => {
      navigator.clipboard.writeText(data);
    };

    const amountFor = (
      value: string | bigint | number | undefined,
      isQrlTransfer: boolean,
    ) => {
      const valueAsBigInt =
        value !== undefined && value !== null
          ? typeof value === "bigint"
            ? value
            : BigInt(value)
          : 0n;
      return isQrlTransfer
        ? Number(utils.fromPlanck(valueAsBigInt, "quanta"))
        : 0;
    };

    // Written as soon as the transaction is broadcast, so it shows up in
    // history (and is picked up by transactionHistoryStore's own
    // pending-transaction poller, see updatePendingTransactionHistory below)
    // even if this approval surface closes before the receipt arrives.
    const recordPendingTransactionHistory = async ({
      from,
      to,
      value,
      data,
      transactionHash,
      isQrlTransfer,
    }: {
      from: string;
      to?: string;
      value?: string | bigint | number;
      data?: string;
      transactionHash: string;
      isQrlTransfer: boolean;
    }) => {
      try {
        const tokenSymbol = blockchain?.nativeCurrency?.symbol ?? "QRL";
        const tokenName = blockchain?.nativeCurrency?.name ?? tokenSymbol;
        const entry: TransactionHistoryEntry = {
          id: transactionHash,
          from,
          to: to ?? "",
          amount: amountFor(value, isQrlTransfer),
          tokenSymbol,
          tokenName,
          isZrc20Token: false,
          tokenContractAddress: "",
          tokenDecimals: 18,
          transactionHash,
          blockNumber: "",
          gasUsed: "",
          effectiveGasPrice: "",
          status: false,
          timestamp: Date.now(),
          chainId: blockchain?.chainId ?? "",
          pendingStatus: "pending",
          data: data ?? undefined,
        };
        await transactionHistoryStore.addTransaction(from, entry);
      } catch (error) {
        console.error(
          "QrlWeb3Wallet: Failed to record pending dApp transaction in history",
          error,
        );
      }
    };

    // Fills in the outcome once the transaction is mined. If this surface
    // is still open when that happens this runs directly; otherwise the
    // "pending" entry above is left for transactionHistoryStore's own
    // poller (startPolling, started whenever any screen next loads this
    // account's history) to resolve the same way it already does for the
    // wallet's own sends.
    const updatePendingTransactionHistory = async (
      from: string,
      transactionHash: string,
      receipt: DAppTransactionReceipt,
    ) => {
      try {
        const isSuccess = receipt.status?.toString() === "1";
        await transactionHistoryStore.updateTransaction(
          from,
          transactionHash,
          {
            pendingStatus: isSuccess ? "confirmed" : "failed",
            status: isSuccess,
            blockNumber: receipt.blockNumber?.toString() ?? "",
            gasUsed: receipt.gasUsed?.toString() ?? "",
            effectiveGasPrice: (receipt.effectiveGasPrice ?? 0).toString(),
          },
        );
      } catch (error) {
        console.error(
          "QrlWeb3Wallet: Failed to record confirmed dApp transaction in history",
          error,
        );
      }
    };

    // qrl_sendTransaction only owes the dApp the transaction hash. Awaiting
    // qrlInstance.sendSignedTransaction() end to end would block that
    // answer until the transaction is mined, which the 90s popup response
    // budget cannot always cover. sendSignedTransaction is a PromiEvent: it
    // still runs its default pre-broadcast revert check
    // (checkRevertBeforeSending, so a reverting call is rejected here and
    // never broadcast) and then emits "transactionHash" as soon as the node
    // accepts the raw transaction, well before its own promise resolves
    // with the receipt. Answer the dApp on that event and let mining
    // continue in the background, the same way the wallet's own send
    // screens (TokenTransfer, NFTTransfer) already treat a broadcast as
    // fire-and-forget.
    const broadcastAndRespond = async ({
      from,
      to,
      value,
      data,
      rawTransactionToSend,
      isQrlTransfer,
    }: {
      from: string;
      to?: string;
      value?: string | bigint | number;
      data?: string;
      rawTransactionToSend: string;
      isQrlTransfer: boolean;
    }) => {
      const promiEvent = qrlInstance?.sendSignedTransaction(
        rawTransactionToSend,
      );
      if (!promiEvent) {
        throw new Error("Transaction could not be broadcast");
      }

      const transactionHash = await new Promise<string>((resolve, reject) => {
        promiEvent.once("transactionHash", (hash) => resolve(String(hash)));
        promiEvent.catch(reject);
      });

      addToResponseData({ transactionHash });

      await recordPendingTransactionHistory({
        from,
        to,
        value,
        data,
        transactionHash,
        isQrlTransfer,
      });

      promiEvent.then(
        async (receipt) => {
          await updatePendingTransactionHistory(
            from,
            transactionHash,
            receipt as DAppTransactionReceipt,
          );
        },
        (error) => {
          // A rejection here means broadcast succeeded but mining did not
          // (e.g. reverted on-chain, or the receipt poll itself failed).
          // The dApp already has the hash; it, or this wallet's own
          // pending-transaction poller, can follow up from there.
          console.error(
            "QrlWeb3Wallet: dApp transaction failed after broadcast",
            error,
          );
        },
      );
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
          const seed = await getAccountSeed(from ?? "");
          const signedTransaction = await qrlInstance?.accounts.signTransaction(
            transactionObject,
            seed,
          );
          rawTransactionToSend = signedTransaction?.rawTransaction;
        }

        if (rawTransactionToSend) {
          await broadcastAndRespond({
            from: from ?? "",
            to,
            value,
            data,
            rawTransactionToSend,
            isQrlTransfer: false,
          });
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
          const seed = await getAccountSeed(from ?? "");
          const signedTransaction = await qrlInstance?.accounts.signTransaction(
            transactionObject,
            seed,
          );
          rawTransactionToSend = signedTransaction?.rawTransaction;
        }

        if (rawTransactionToSend) {
          await broadcastAndRespond({
            from,
            to,
            value,
            rawTransactionToSend,
            isQrlTransfer: true,
          });
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
