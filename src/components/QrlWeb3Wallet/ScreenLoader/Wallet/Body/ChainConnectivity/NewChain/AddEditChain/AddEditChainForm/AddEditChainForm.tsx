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
import { BlockchainDataType } from "@/configuration/qrlBlockchainConfig";
import { ROUTES } from "@/router/router";
import { checkWalletAddQrlChainParams } from "@/scripts/utils/restrictedMethodsMiddlewareUtils";
import { useStore } from "@/stores/store";
import StorageUtil from "@/utilities/storageUtil";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader, Pencil, Plus, X } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import UrlSelections from "./UrlSelections/UrlSelections";
import ChainIcon from "../../../ChainIcon/ChainIcon";

type AddEditChainFormType = {
  chainToEdit?: BlockchainDataType;
};

const FormSchema = z.object({
  chainName: z.string().min(1, "Chain name is required"),
  chainId: z.coerce.number().gt(0, "Chain ID should be positive"),
  currencyName: z.string().min(1, "Currency name is required"),
  currencySymbol: z.string().min(1, "Currency symbol is required"),
  currencyDecimals: z.coerce.number().gt(0, "Decimals should be positive"),
});

const AddEditChainForm = observer(({ chainToEdit }: AddEditChainFormType) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { qrlStore } = useStore();
  const { initializeBlockchain, addChain, editChain } = qrlStore;

  const [rpcUrls, setRpcUrls] = useState<string[]>([]);
  const [defaultRpcUrl, setDefaultRpcUrl] = useState("");
  const [blockExplorerUrls, setBlockExplorerUrls] = useState<string[]>([]);
  const [defaultBlockExplorerUrl, setDefaultBlockExplorerUrl] = useState("");
  const [iconUrls, setIconUrls] = useState<string[]>([]);
  const [defaultIconUrl, setDefaultIconUrl] = useState("");
  const [qrnsRegistryAddress, setQrnsRegistryAddress] = useState("");
  const [error, setError] = useState("");

  const isChainEdit = !!chainToEdit;
  const labelText = isChainEdit ? t('chain.editTitle') : t('chain.addTitle');
  const buttonSubmittingText = isChainEdit ? t('chain.editingButton') : t('chain.addingButton');
  const isCustomChain = chainToEdit?.isCustomChain ?? true;

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: "onChange",
    reValidateMode: "onSubmit",
    defaultValues: {
      chainName: "",
      chainId: undefined,
      currencyName: "",
      currencySymbol: "",
      currencyDecimals: undefined,
    },
  });
  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isValid },
  } = form;

  useEffect(() => {
    if (isChainEdit) {
      form.reset({
        chainName: chainToEdit.chainName,
        chainId: parseInt(chainToEdit.chainId, 16),
        currencyName: chainToEdit.nativeCurrency.name,
        currencySymbol: chainToEdit.nativeCurrency.symbol,
        currencyDecimals: chainToEdit.nativeCurrency.decimals,
      });
      setRpcUrls(chainToEdit.rpcUrls);
      setDefaultRpcUrl(chainToEdit.defaultRpcUrl);
      setBlockExplorerUrls(chainToEdit.blockExplorerUrls);
      setDefaultBlockExplorerUrl(chainToEdit.defaultBlockExplorerUrl);
      setIconUrls(chainToEdit.iconUrls);
      setDefaultIconUrl(chainToEdit.defaultIconUrl);
      setQrnsRegistryAddress(chainToEdit.qrnsRegistryAddress ?? "");
    }
  }, [isChainEdit, chainToEdit, form]);

  useEffect(() => {
    const firstItem = rpcUrls.at(0) ?? "";
    setDefaultRpcUrl(
      rpcUrls.find((urlItem) => urlItem === defaultRpcUrl) ?? firstItem,
    );
  }, [rpcUrls]);

  useEffect(() => {
    const firstItem = blockExplorerUrls.at(0) ?? "";
    setDefaultBlockExplorerUrl(
      blockExplorerUrls.find(
        (urlItem) => urlItem === defaultBlockExplorerUrl,
      ) ?? firstItem,
    );
  }, [blockExplorerUrls]);

  useEffect(() => {
    const firstItem = iconUrls.at(0) ?? "";
    setDefaultIconUrl(
      iconUrls.find((urlItem) => urlItem === defaultIconUrl) ?? firstItem,
    );
  }, [iconUrls]);

  const generateBlockchainData = (formData: z.infer<typeof FormSchema>) => {
    const normalizedQrnsRegistryAddress = qrnsRegistryAddress.trim();
    const chainData: BlockchainDataType = {
      chainName: formData.chainName,
      chainId: "0x".concat(formData.chainId.toString(16)),
      nativeCurrency: {
        name: formData.currencyName,
        symbol: formData.currencySymbol,
        decimals: formData.currencyDecimals,
      },
      rpcUrls,
      blockExplorerUrls,
      iconUrls,
      defaultRpcUrl,
      defaultBlockExplorerUrl,
      defaultIconUrl,
      isTestnet: false,
      defaultWsRpcUrl: "http://127.0.0.1:8545",
      isCustomChain: true,
      qrnsRegistryAddress: normalizedQrnsRegistryAddress || undefined,
    };
    return chainData;
  };

  const addBlockchain = async (blockchainData: BlockchainDataType) => {
    const { chainFound, updatedChainList } = await addChain(blockchainData);
    if (chainFound) {
      setError(
        t('chain.errorChainIdExists', { chainId: blockchainData.chainId }),
      );
      return;
    }
    await StorageUtil.setAllBlockChains(updatedChainList);
    navigate(ROUTES.CHAIN_CONNECTIVITY);
  };

  const editBlockchain = async (blockchainData: BlockchainDataType) => {
    const { updatedChainList } = await editChain(blockchainData);
    await StorageUtil.setAllBlockChains(updatedChainList);
    navigate(ROUTES.CHAIN_CONNECTIVITY);
    await initializeBlockchain();
  };

  async function onSubmit(formData: z.infer<typeof FormSchema>) {
    setError("");
    const blockchainData = generateBlockchainData(formData);
    const { canProceed, proceedError } = await checkWalletAddQrlChainParams(
      blockchainData,
      true,
    );
    if (!canProceed) {
      setError(proceedError?.message ?? "Form validation failed");
      return;
    }
    if (isChainEdit) {
      await editBlockchain(blockchainData);
    } else {
      await addBlockchain(blockchainData);
    }
  }

  return (
    <Form {...form}>
      <form className="w-full" onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader className="flex-row items-end justify-between">
            <CardTitle>{labelText}</CardTitle>
            <ChainIcon
              src={defaultIconUrl}
              alt={chainToEdit?.chainName ?? ""}
            />
          </CardHeader>
          <CardContent className="space-y-8">
            <FormField
              control={control}
              name="chainName"
              render={({ field }) => (
                <FormItem>
                  <Label>{t('chain.chainName')}</Label>
                  <FormControl>
                    <Input
                      {...field}
                      aria-label={field.name}
                      autoComplete="off"
                      disabled={isSubmitting}
                      placeholder={t('chain.chainNamePlaceholder')}
                      type="text"
                    />
                  </FormControl>
                  <FormDescription>{t('chain.chainNameDescription')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="chainId"
              render={({ field }) => (
                <FormItem>
                  <Label>{t('chain.chainIdLabel')}</Label>
                  <FormControl>
                    <Input
                      {...field}
                      aria-label={field.name}
                      autoComplete="off"
                      disabled={isSubmitting || isChainEdit}
                      placeholder={t('chain.chainIdPlaceholder')}
                      type="number"
                    />
                  </FormControl>
                  <FormDescription>{t('chain.chainIdDescription')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <UrlSelections
              title={t('chain.rpcUrls')}
              canBeEmpty={false}
              urls={rpcUrls}
              setUrls={setRpcUrls}
              defaultUrl={defaultRpcUrl}
              setDefaultUrl={setDefaultRpcUrl}
            />
            <UrlSelections
              title={t('chain.blockExplorerUrls')}
              canBeEmpty={true}
              urls={blockExplorerUrls}
              setUrls={setBlockExplorerUrls}
              defaultUrl={defaultBlockExplorerUrl}
              setDefaultUrl={setDefaultBlockExplorerUrl}
            />
            <UrlSelections
              title={t('chain.iconUrls')}
              canBeEmpty={true}
              urls={iconUrls}
              setUrls={setIconUrls}
              defaultUrl={defaultIconUrl}
              setDefaultUrl={setDefaultIconUrl}
            />
            <div>
              <Label>{t('chain.qrnsRegistryAddress')}</Label>
              <Input
                value={qrnsRegistryAddress}
                onChange={(e) => setQrnsRegistryAddress(e.target.value)}
                autoComplete="off"
                disabled={isSubmitting}
                placeholder={t('chain.qrnsRegistryAddressPlaceholder')}
                type="text"
              />
              <p className="text-[0.8rem] text-muted-foreground mt-1">
                {t('chain.qrnsRegistryAddressDescription')}
              </p>
            </div>
            <FormField
              control={control}
              name="currencyName"
              render={({ field }) => (
                <FormItem>
                  <Label>{t('chain.currencyName')}</Label>
                  <FormControl>
                    <Input
                      {...field}
                      aria-label={field.name}
                      autoComplete="off"
                      disabled={isSubmitting || !isCustomChain}
                      placeholder={t('chain.currencyNamePlaceholder')}
                      type="text"
                    />
                  </FormControl>
                  <FormDescription>{t('chain.currencyNameDescription')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-4">
              <FormField
                control={control}
                name="currencySymbol"
                render={({ field }) => (
                  <FormItem>
                    <Label>{t('chain.currencySymbol')}</Label>
                    <FormControl>
                      <Input
                        {...field}
                        aria-label={field.name}
                        autoComplete="off"
                        disabled={isSubmitting || !isCustomChain}
                        placeholder={t('chain.currencySymbolPlaceholder')}
                        type="text"
                      />
                    </FormControl>
                    <FormDescription>{t('chain.currencySymbolDescription')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="currencyDecimals"
                render={({ field }) => (
                  <FormItem>
                    <Label>{t('chain.currencyDecimals')}</Label>
                    <FormControl>
                      <Input
                        {...field}
                        aria-label={field.name}
                        autoComplete="off"
                        disabled={isSubmitting || !isCustomChain}
                        placeholder={t('chain.currencyDecimalsPlaceholder')}
                        type="number"
                      />
                    </FormControl>
                    <FormDescription>{t('chain.currencyDecimalsDescription')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {error && (
              <div className="text-sm font-bold text-destructive">{error}</div>
            )}
          </CardContent>
          <CardFooter className="gap-4">
            <Button
              className="w-full"
              type="button"
              variant="outline"
              onClick={() => {
                navigate(ROUTES.CHAIN_CONNECTIVITY);
              }}
            >
              <X className="mr-2 h-4 w-4" />
              {t('chain.cancelButton')}
            </Button>
            <Button
              disabled={isSubmitting || !isValid}
              className="w-full"
              type="submit"
              aria-label="Add/edit chain"
            >
              {isSubmitting ? (
                <Loader className="mr-2 h-4 w-4 animate-spin" />
              ) : isChainEdit ? (
                <Pencil className="mr-2 h-4 w-4" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {isSubmitting ? buttonSubmittingText : labelText}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
});

export default AddEditChainForm;
