import { Button } from "@/components/UI/Button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/UI/Card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/UI/Form";
import { Input } from "@/components/UI/Input";
import { Label } from "@/components/UI/Label";
import { NFT_UNITS_OF_GAS, ZRC_721_CONTRACT_ABI } from "@/constants/nftToken";
import { ROUTES } from "@/router/router";
import { useStore } from "@/stores/store";
import type { TransactionHistoryEntry } from "@/types/transactionHistory";
import AddressUtil from "@/utilities/addressUtil";
import { isSuccessfulReceiptStatus } from "@/utilities/receiptStatusUtil";
import StorageUtil from "@/utilities/storageUtil";
import StringUtil from "@/utilities/stringUtil";
import { isQrnsName, resolveQrnsName } from "@/utilities/qrnsResolver";
import { zodResolver } from "@hookform/resolvers/zod";
import { qrl, utils } from "@theqrl/web3";
import { Image, Loader, Send, X } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { z } from "zod";
import BackButton from "../../../Shared/BackButton/BackButton";
import CircuitBackground from "../../../Shared/CircuitBackground/CircuitBackground";
import RecipientPicker from "../TokenTransfer/RecipientPicker/RecipientPicker";

const { Common } = qrl.accounts;

const createFormSchema = (t: TFunction) =>
  z
    .object({
      receiverAddress: z.string().min(1, t("validation.receiverRequired")),
    })
    .refine(
      (fields) =>
        AddressUtil.isQrlAddress(fields.receiverAddress.trim()) ||
        isQrnsName(fields.receiverAddress),
      {
        message: t("validation.addressInvalid"),
        path: ["receiverAddress"],
      },
    );

const NFTTransfer = observer(() => {
  const { t } = useTranslation();
  const FormSchema = createFormSchema(t);
  const { state } = useLocation();
  const navigate = useNavigate();
  const { lockStore, qrlStore, ledgerStore, transactionHistoryStore } =
    useStore();
  const { getAccountSeed } = lockStore;
  const {
    activeAccount,
    signNftTransfer,
    fetchAccounts,
    sendRawTransaction,
    qrlInstance,
    getGasFeeData,
  } = qrlStore;
  const { accountAddress } = activeAccount;

  const contractAddress: string = state?.contractAddress ?? "";
  const tokenId: string = state?.tokenId ?? "";
  const collectionName: string = state?.collectionName ?? "";
  const nftImageUrl: string = state?.imageUrl ?? "";
  const nftName: string = state?.nftName ?? "";

  const [pickerOpen, setPickerOpen] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [qrnsResolving, setQrnsResolving] = useState(false);
  const [qrnsError, setQrnsError] = useState<string | null>(null);

  const { prefix, addressSplit } = StringUtil.getSplitAddress(contractAddress);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: {
      receiverAddress: "",
    },
  });
  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting, isValid },
  } = form;

  type SignResult = {
    transactionHash?: string;
    rawTransaction?: string;
    error: string;
    nonce?: number;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gasLimit?: number;
    data?: string;
  };

  const signNftTransferWithLedger = async (
    receiver: string,
  ): Promise<SignResult> => {
    let result: SignResult = { error: "" };

    try {
      if (!qrlInstance?.Contract) {
        throw new Error("Blockchain connection not available");
      }

      const contract = new qrlInstance.Contract(
        ZRC_721_CONTRACT_ABI,
        contractAddress,
      );
      const transferCall = contract.methods.safeTransferFrom(
        accountAddress,
        receiver,
        BigInt(tokenId),
      );
      const encodedData = transferCall.encodeABI();
      const { maxFeePerGas, maxPriorityFeePerGas } = await getGasFeeData();
      const nonce = await qrlInstance.getTransactionCount(accountAddress);
      const chainId = await qrlInstance.getChainId();

      const common = Common.custom({ chainId: Number(chainId) });
      const txData = {
        nonce: `0x${(nonce ?? 0).toString(16)}`,
        maxPriorityFeePerGas: `0x${Number(maxPriorityFeePerGas).toString(16)}`,
        maxFeePerGas: `0x${Number(maxFeePerGas).toString(16)}`,
        gasLimit: `0x${BigInt(NFT_UNITS_OF_GAS).toString(16)}`,
        to: contractAddress,
        value: "0x0",
        data: encodedData,
      };

      const signedRawTxHex = await ledgerStore.signAndSerializeTransaction(
        accountAddress,
        txData,
        common,
      );
      const transactionHash = utils.sha3(signedRawTxHex);

      result = {
        transactionHash: transactionHash?.toString(),
        rawTransaction: signedRawTxHex,
        error: "",
        nonce: Number(nonce),
        maxFeePerGas: maxFeePerGas.toString(),
        maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
        gasLimit: NFT_UNITS_OF_GAS,
        data: encodedData,
      };
    } catch (error) {
      console.error("[NFTTransfer] Ledger signing failed:", error);
      result.error = error instanceof Error ? error.message : String(error);
    }

    return result;
  };

  async function onSubmit(formData: z.infer<typeof FormSchema>) {
    try {
      let receiver = formData.receiverAddress;
      if (isQrnsName(receiver) && resolvedAddress) {
        receiver = resolvedAddress;
      }

      const isLedgerAccount = ledgerStore.isLedgerAccount(accountAddress);
      const signResult = isLedgerAccount
        ? await signNftTransferWithLedger(receiver)
        : await signNftTransfer(
            accountAddress,
            receiver,
            tokenId,
            await getAccountSeed(accountAddress),
            contractAddress,
          );

      const {
        transactionHash,
        rawTransaction,
        error,
        nonce,
        maxFeePerGas,
        maxPriorityFeePerGas,
        gasLimit,
        data,
      } = signResult;

      if (error) {
        control.setError("receiverAddress", {
          message: t("transfer.errorOccurred", { error }),
        });
        return;
      }

      if (!transactionHash || !rawTransaction) {
        control.setError("receiverAddress", {
          message: t("transfer.errorFailed"),
        });
        return;
      }

      const { chainId } = await StorageUtil.getActiveBlockChain();
      const historyEntry: TransactionHistoryEntry = {
        id: transactionHash,
        from: accountAddress,
        to: receiver,
        amount: 0,
        tokenSymbol: collectionName,
        tokenName: `${nftName || collectionName} #${tokenId}`,
        isZrc20Token: false,
        tokenContractAddress: contractAddress,
        tokenDecimals: 0,
        transactionHash,
        blockNumber: "",
        gasUsed: "",
        effectiveGasPrice: "",
        status: false,
        timestamp: Date.now(),
        chainId,
        pendingStatus: "pending",
        nonce,
        maxFeePerGas,
        maxPriorityFeePerGas,
        gasLimit,
        data,
      };
      await transactionHistoryStore.addTransaction(
        accountAddress,
        historyEntry,
      );

      sendRawTransaction(rawTransaction).then(
        async (receipt) => {
          if (receipt) {
            const isSuccess = isSuccessfulReceiptStatus(receipt.status);
            await transactionHistoryStore.updateTransaction(
              accountAddress,
              transactionHash,
              {
                pendingStatus: isSuccess ? "confirmed" : "failed",
                status: isSuccess,
                blockNumber: receipt.blockNumber?.toString() ?? "",
                gasUsed: receipt.gasUsed?.toString() ?? "",
                effectiveGasPrice: (receipt.effectiveGasPrice ?? 0).toString(),
              },
            );
            await fetchAccounts();
          }
        },
        async (err) => {
          console.error("[NFTTransfer] Broadcast failed:", err);
          await transactionHistoryStore.updateTransaction(
            accountAddress,
            transactionHash,
            {
              pendingStatus: "failed",
              status: false,
              errorMessage: err instanceof Error ? err.message : String(err),
            },
          );
        },
      );

      navigate(ROUTES.TRANSACTION_HISTORY);
    } catch (error) {
      control.setError("receiverAddress", {
        message: t("transfer.errorOccurred", { error }),
      });
    }
  }

  const watchedReceiver = watch("receiverAddress");
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(resolveTimerRef.current);

    if (!watchedReceiver || !isQrnsName(watchedReceiver)) {
      setResolvedAddress(null);
      setQrnsError(null);
      setQrnsResolving(false);
      return;
    }

    setQrnsResolving(true);
    setQrnsError(null);
    setResolvedAddress(null);

    const rpcUrl = qrlStore.qrlConnection.blockchain.defaultRpcUrl;
    const registry = qrlStore.qrlConnection.blockchain.qrnsRegistryAddress;
    const nameToResolve = watchedReceiver.trim();

    resolveTimerRef.current = setTimeout(() => {
      resolveQrnsName(nameToResolve, rpcUrl, registry)
        .then((addr) => {
          setResolvedAddress(addr);
          setQrnsError(null);
        })
        .catch(() => {
          setResolvedAddress(null);
          setQrnsError(t("transfer.qrnsResolutionFailed"));
        })
        .finally(() => setQrnsResolving(false));
    }, 500);

    return () => clearTimeout(resolveTimerRef.current);
  }, [watchedReceiver]);

  const [imageError, setImageError] = useState(false);

  return (
    <Form {...form}>
      <form className="w-full" onSubmit={handleSubmit(onSubmit)}>
        <CircuitBackground />
        <div className="relative z-10 p-8">
          <BackButton />
          <Card className="w-full">
            <CardHeader>
              <CardTitle>{t("nft.sendNft")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                  {nftImageUrl && !imageError ? (
                    <img
                      src={nftImageUrl}
                      alt={nftName || `#${tokenId}`}
                      className="h-full w-full object-cover"
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Image className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-bold">
                    {nftName || `${collectionName} #${tokenId}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Token #{tokenId}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="text-xs text-muted-foreground">
                  {t("nft.contractAddress")}
                </div>
                <div className="flex flex-wrap gap-1 text-xs font-bold text-secondary">
                  {`${prefix} ${addressSplit.join(" ")}`}
                </div>
              </div>

              <FormField
                control={control}
                name="receiverAddress"
                render={({ field }) => (
                  <FormItem>
                    <Label>{t("transfer.sendTo")}</Label>
                    <div className="flex items-center gap-1">
                      <FormControl>
                        <Input
                          {...field}
                          aria-label={field.name}
                          autoComplete="off"
                          disabled={isSubmitting}
                          placeholder={t("transfer.receiverPlaceholder")}
                        />
                      </FormControl>
                      <RecipientPicker
                        open={pickerOpen}
                        onOpenChange={setPickerOpen}
                        onSelect={(address) => {
                          form.setValue("receiverAddress", address, {
                            shouldValidate: true,
                          });
                        }}
                      />
                    </div>
                    <FormDescription>
                      {t("transfer.receiverDescription")}
                    </FormDescription>
                    {qrnsResolving && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader className="h-3 w-3 animate-spin" />
                        {t("transfer.qrnsResolving")}
                      </p>
                    )}
                    {resolvedAddress && !qrnsResolving && (
                      <p className="text-xs text-green-500">
                        → {resolvedAddress}
                      </p>
                    )}
                    {qrnsError && !qrnsResolving && (
                      <p className="text-xs text-destructive">{qrnsError}</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="gap-4">
              <Button
                className="w-full"
                type="button"
                variant="outline"
                onClick={() => navigate(-1)}
              >
                <X className="mr-2 h-4 w-4" />
                {t("transfer.cancelButton")}
              </Button>
              <Button
                disabled={
                  isSubmitting ||
                  !isValid ||
                  qrnsResolving ||
                  (isQrnsName(watchedReceiver) && !resolvedAddress)
                }
                className="w-full"
              >
                {isSubmitting ? (
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {isSubmitting ? t("nft.sendingNft") : t("nft.sendNftButton")}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </form>
    </Form>
  );
});

export default NFTTransfer;
