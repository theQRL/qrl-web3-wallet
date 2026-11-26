import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/UI/tabs";
import { useStore } from "@/stores/store";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import QrlRequestAccountAccountSelection from "./QrlRequestAccountAccountSelection/QrlRequestAccountAccountSelection";
import QrlRequestAccountBlockchainSelection from "./QrlRequestAccountBlockchainSelection/QrlRequestAccountBlockchainSelection";
import StorageUtil from "@/utilities/storageUtil";
import { BlockchainDataType } from "@/configuration/qrlBlockchainConfig";

const QrlRequestAccountContent = observer(() => {
  const { t } = useTranslation();
  const { dAppRequestStore } = useStore();
  const {
    addToResponseData,
    setCanProceed,
    setOnPermissionCallBack,
  } = dAppRequestStore;

  const [isLoadingBlockchains, setIsLoadingBlockchains] = useState(true);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [allBlockchains, setAllBlockchains] = useState<BlockchainDataType[]>(
    [],
  );
  const [selectedBlockchains, setSelectedBlockchains] = useState<
    BlockchainDataType[]
  >([]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const allBlockchains = await StorageUtil.getAllBlockChains();
      // Seed from the grants held by the origin that made *this* request, not by
      // whatever tab happens to be active. A request from a cross-origin iframe or
      // a background tab used to arrive pre-ticked with the victim dApp's accounts,
      // turning the grant into a single frictionless click. See CIPH-QRLW326-6.
      const { accounts, blockchains } =
        await dAppRequestStore.getRequestingOriginGrants();
      if (controller.signal.aborted) return;
      setSelectedAccounts(accounts);
      setAllBlockchains(allBlockchains);
      setSelectedBlockchains(blockchains);
      setIsLoadingBlockchains(false);
    })();
    return () => {
      controller.abort();
    };
  }, [dAppRequestStore, dAppRequestStore.dAppRequestData]);

  useEffect(() => {
    addToResponseData({
      accounts: selectedAccounts,
      blockchains: selectedBlockchains,
    });
    setCanProceed(!!selectedAccounts.length && !!selectedBlockchains.length);
  }, [selectedAccounts, selectedBlockchains]);

  // Register an explicit no-op handler for this request.
  //
  // Granting the connection is done by the service worker's post-approval branch
  // from `responseData`, so there is genuinely nothing for this screen to do on
  // approval. Registering anyway is the point: this was the only approval screen
  // that installed no handler, so whatever the previous request had installed
  // stayed live and was executed by the user's click on *this* prompt.
  useEffect(() => {
    setOnPermissionCallBack(() => Promise.resolve());
  }, [setOnPermissionCallBack, dAppRequestStore.dAppRequestData]);

  const onAccountSelection = (selectedAccount: string, checked: boolean) => {
    let updatedAccounts = selectedAccounts;
    if (checked) {
      updatedAccounts = Array.from(
        new Set([...updatedAccounts, selectedAccount]),
      );
    } else {
      updatedAccounts = updatedAccounts.filter(
        (account) => account !== selectedAccount,
      );
    }
    setSelectedAccounts(updatedAccounts);
  };

  const onBlockchainSelection = (
    selectedBlockchain: BlockchainDataType,
    checked: boolean,
  ) => {
    let updatedBlockchains = selectedBlockchains;
    if (checked) {
      updatedBlockchains = Array.from(
        new Set([...updatedBlockchains, selectedBlockchain]),
      );
    } else {
      updatedBlockchains = updatedBlockchains.filter(
        (blockchain) => blockchain.chainId !== selectedBlockchain.chainId,
      );
    }
    setSelectedBlockchains(updatedBlockchains);
  };

  return (
    <Tabs defaultValue="accounts">
      <TabsList className="w-full">
        <TabsTrigger
          value="accounts"
          className="w-full data-[state=active]:text-secondary"
        >
          {t('dapp.requestAccount.tabAccounts')}
        </TabsTrigger>
        <TabsTrigger
          value="blockchains"
          className="w-full data-[state=active]:text-secondary"
        >
          {t('dapp.requestAccount.tabBlockchains')}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="accounts" className="rounded-md p-2">
        <QrlRequestAccountAccountSelection
          selectedAccounts={selectedAccounts}
          onAccountSelection={onAccountSelection}
        />
      </TabsContent>
      <TabsContent value="blockchains" className="rounded-md p-2">
        <QrlRequestAccountBlockchainSelection
          isLoading={isLoadingBlockchains}
          allBlockchains={allBlockchains}
          selectedBlockchains={selectedBlockchains}
          onBlockchainSelection={onBlockchainSelection}
        />
      </TabsContent>
    </Tabs>
  );
});

export default QrlRequestAccountContent;
