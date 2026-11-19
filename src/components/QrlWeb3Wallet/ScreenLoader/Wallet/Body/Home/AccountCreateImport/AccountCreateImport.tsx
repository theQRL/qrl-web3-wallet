import { Button } from "@/components/UI/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/UI/Card";
import { ROUTES } from "@/router/router";
import { useStore } from "@/stores/store";
import { cva } from "class-variance-authority";
import { Download, History, Image, Logs, Plus, Send, Usb } from "lucide-react";
import { observer } from "mobx-react-lite";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ActiveAccountDisplay from "./ActiveAccountDisplay/ActiveAccountDisplay";
import TokensCardContent from "./ActiveAccountDisplay/TokensCardContent/TokensCardContent";
import NFTCollections from "./ActiveAccountDisplay/TokensCardContent/NFTCollections/NFTCollections";
import { useEffect, useState } from "react";
import StorageUtil from "@/utilities/storageUtil";
import { QRC_20_ITEMS_DISPLAY_LIMIT } from "@/constants/qrc20Token";

const tokensClasses = cva("w-full", {
  variants: {
    hasTokensPreference: {
      true: ["order-first"],
      false: ["order-2"],
    },
  },
  defaultVariants: {
    hasTokensPreference: false,
  },
});

const nftClasses = cva("w-full", {
  variants: {
    hasTokensPreference: {
      true: ["order-first"],
      false: ["order-3"],
    },
  },
  defaultVariants: {
    hasTokensPreference: false,
  },
});

const addAccountsClasses = cva("w-full", {
  variants: {
    hasAccountCreationPreference: {
      true: ["order-first"],
      false: ["order-4"],
    },
  },
  defaultVariants: {
    hasAccountCreationPreference: false,
  },
});

const AccountCreateImport = observer(() => {
  const { t } = useTranslation();
  const { state } = useLocation();
  const { qrlStore } = useStore();
  const { activeAccount } = qrlStore;
  const { accountAddress } = activeAccount;

  const hasActiveAccount = !!accountAddress;
  const hasAccountCreationPreference = !!state?.hasAccountCreationPreference;
  const hasTokensPreference = !!state?.hasTokensPreference;

  const [tokenContractsList, setTokenContractsList] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const storedTokens =
        await StorageUtil.getTokenContractsList(accountAddress);
      setTokenContractsList(storedTokens.map((token) => token?.address));
    })();
  }, [accountAddress]);

  return (
    <div className="flex animate-appear-in flex-col gap-8">
      {hasActiveAccount && (
        <>
          <Card className="order-1 w-full">
            <CardHeader>
              <CardTitle>{t('home.activeAccount')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActiveAccountDisplay />
            </CardContent>
            <CardFooter className="flex-col gap-2">
              <Link
                className="w-full"
                to={ROUTES.TOKEN_TRANSFER}
                state={{ shouldStartFresh: true }}
              >
                <Button className="w-full" type="button">
                  <Send className="mr-2 h-4 w-4" />
                  {t('home.sendQuanta')}
                </Button>
              </Link>
              <Link className="w-full" to={ROUTES.TRANSACTION_HISTORY}>
                <Button className="w-full" type="button" variant="outline">
                  <History className="mr-2 h-4 w-4" />
                  {t('home.transactionHistory')}
                </Button>
              </Link>
            </CardFooter>
          </Card>
          <Card className={tokensClasses({ hasTokensPreference })}>
            <CardHeader>
              <CardTitle>{t('home.tokens')}</CardTitle>
            </CardHeader>
            <CardContent>
              <TokensCardContent />
            </CardContent>
            <CardFooter className="flex-col gap-4">
              <Link className="w-full" to={ROUTES.IMPORT_TOKEN}>
                <Button className="w-full" type="button">
                  <Download className="mr-2 h-4 w-4" />
                  {t('home.importToken')}
                </Button>
              </Link>
              {tokenContractsList.length > QRC_20_ITEMS_DISPLAY_LIMIT && (
                <Link className="w-full" to={ROUTES.ALL_QRC_20_TOKENS}>
                  <Button className="w-full" type="button" variant="outline">
                    <Logs className="mr-2 h-4 w-4" />
                    {t('home.viewAllTokens')}
                  </Button>
                </Link>
              )}
            </CardFooter>
          </Card>
          <Card className={nftClasses({ hasTokensPreference })}>
            <CardHeader>
              <CardTitle>{t('home.nftCollections')}</CardTitle>
            </CardHeader>
            <CardContent>
              <NFTCollections />
            </CardContent>
            <CardFooter>
              <Link className="w-full" to={ROUTES.IMPORT_NFT_COLLECTION}>
                <Button className="w-full" type="button">
                  <Image className="mr-2 h-4 w-4" />
                  {t('nft.importButton')}
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </>
      )}
      <Card className={addAccountsClasses({ hasAccountCreationPreference })}>
        <CardHeader>
          <CardTitle>{t('home.addAccounts')}</CardTitle>
          <CardDescription>
            {t('home.addAccountsDescription')}
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex-col gap-4">
          <Link className="w-full" to={ROUTES.CREATE_ACCOUNT}>
            <Button className="w-full" type="button">
              <Plus className="mr-2 h-4 w-4" />
              {t('home.createAccount')}
            </Button>
          </Link>
          <Link className="w-full" to={ROUTES.IMPORT_ACCOUNT}>
            <Button className="w-full" type="button" variant="outline">
              <Download className="mr-2 h-4 w-4" />
              {t('home.importAccount')}
            </Button>
          </Link>
          <Link className="w-full" to={ROUTES.IMPORT_LEDGER}>
            <Button className="w-full" type="button" variant="outline">
              <Usb className="mr-2 h-4 w-4" />
              {t('home.connectLedger')}
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
});

export default AccountCreateImport;
