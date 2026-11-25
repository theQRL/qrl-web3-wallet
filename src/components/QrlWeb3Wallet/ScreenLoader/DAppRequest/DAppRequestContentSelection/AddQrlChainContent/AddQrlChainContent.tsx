import { Button } from "@/components/UI/Button";
import { Card, CardContent, CardFooter } from "@/components/UI/Card";
import { useStore } from "@/stores/store";
import { Check, X } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import AddQrlChainInfo from "./AddQrlChainInfo/AddQrlChainInfo";
import { BlockchainBaseDataType } from "@/configuration/qrlBlockchainConfig";
import StorageUtil from "@/utilities/storageUtil";
import {
  includeChainForUrlOrigin,
  isAcceptableUrl,
} from "@/scripts/utils/restrictedMethodsMiddlewareUtils";

const AddQrlChainContent = observer(() => {
  const { t } = useTranslation();
  const { dAppRequestStore, qrlStore } = useStore();
  const { addChain, selectBlockchain } = qrlStore;
  const {
    dAppRequestData,
    onPermission,
    approvalProcessingStatus,
    setOnPermissionCallBack,
    addToResponseData,
  } = dAppRequestStore;
  const { isProcessing } = approvalProcessingStatus;

  const addBlockchain = async () => {
    const onPermissionCallBack = async (hasApproved: boolean) => {
      if (hasApproved) {
        const blockchain = dAppRequestData
          ?.params?.[0] as BlockchainBaseDataType;
        const { chainFound, updatedChainList } = await addChain({
          chainName: blockchain?.chainName,
          chainId: blockchain?.chainId,
          nativeCurrency: blockchain?.nativeCurrency,
          rpcUrls: blockchain?.rpcUrls,
          blockExplorerUrls: blockchain?.blockExplorerUrls,
          iconUrls: blockchain?.iconUrls,
          // The request is accepted when at least one URL is acceptable, so
          // the live endpoint is the first URL that passes that check.
          defaultRpcUrl: blockchain?.rpcUrls?.find(isAcceptableUrl) ?? "",
          defaultBlockExplorerUrl: blockchain?.blockExplorerUrls?.[0] ?? "",
          defaultIconUrl: blockchain?.iconUrls?.[0] ?? "",
          isTestnet: false,
          defaultWsRpcUrl: "http://127.0.0.1:8545",
          isCustomChain: true,
        });
        if (!chainFound) {
          await StorageUtil.setAllBlockChains(updatedChainList);
          await StorageUtil.clearDAppsRequestData();
          await includeChainForUrlOrigin({
            urlOrigin: dAppRequestData?.requestData?.senderData?.url ?? "",
            chainId: blockchain?.chainId,
          });
          await selectBlockchain(blockchain?.chainId);
        }
        addToResponseData({ result: true });
      }
    };
    setOnPermissionCallBack(onPermissionCallBack);
    await onPermission(true);
  };

  return (
    <Card className="w-full">
      <div className="p-6">
        <div className="mb-1 text-xs font-bold">{t('dapp.addChain.title')}</div>
        <div>
          {t('dapp.addChain.description')}
        </div>
      </div>
      <CardContent className="space-y-6">
        <AddQrlChainInfo />
        <div className="font-bold">{t('dapp.addChain.question')}</div>
      </CardContent>
      <CardFooter className="grid grid-cols-2 gap-4">
        <Button
          className="w-full"
          variant="outline"
          type="button"
          disabled={isProcessing}
          aria-label="No"
          onClick={() => onPermission(false)}
        >
          <X className="mr-2 h-4 w-4" />
          {t('dapp.no')}
        </Button>
        <Button
          className="w-full"
          type="button"
          disabled={isProcessing}
          aria-label="Yes"
          onClick={() => addBlockchain()}
        >
          <Check className="mr-2 h-4 w-4" />
          {t('dapp.yes')}
        </Button>
      </CardFooter>
    </Card>
  );
});

export default AddQrlChainContent;
