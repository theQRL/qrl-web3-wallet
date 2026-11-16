import { Button } from "@/components/UI/Button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/UI/Card";
import { ROUTES } from "@/router/router";
import { useStore } from "@/stores/store";
import StorageUtil from "@/utilities/storageUtil";
import StringUtil from "@/utilities/stringUtil";
import { getRandomTailwindTextColor } from "@/utilities/stylingUtil";
import { Download, Image, X } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

type NFTCollectionImportSuccessProps = {
  collection?: { name: string; symbol: string; balance: number };
  onCancelImport: () => void;
  contractAddress: string;
};

const NFTCollectionImportSuccess = observer(
  ({
    collection,
    onCancelImport,
    contractAddress,
  }: NFTCollectionImportSuccessProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { qrlStore } = useStore();
    const { activeAccount } = qrlStore;
    const { accountAddress } = activeAccount;

    const name = collection?.name;
    const symbol = collection?.symbol;
    const balance = collection?.balance;

    const { prefix, addressSplit } =
      StringUtil.getSplitAddress(contractAddress);

    const onConfirmImport = async () => {
      await StorageUtil.setNFTCollectionsList(accountAddress, {
        address: contractAddress,
        name: name ?? "",
        symbol: symbol ?? "",
        standard: "QRC721",
        image: "",
      });
      navigate(ROUTES.HOME);
    };

    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('nft.importCollection')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4">
            <Image
              className={`shrink-0 ${getRandomTailwindTextColor(symbol)}`}
              size={64}
            />
            <div className="flex flex-col gap-1">
              <div>{t('nft.contractAddress')}</div>
              <div className="flex flex-wrap gap-1 font-bold text-secondary">
                {`${prefix} ${addressSplit.join(" ")}`}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <div>{t('nft.collectionName')}</div>
              <div className="font-bold text-secondary">{name}</div>
            </div>
            <div className="flex flex-col gap-1">
              <div>{t('nft.collectionSymbol')}</div>
              <div className="font-bold text-secondary">{symbol}</div>
            </div>
            <div className="flex flex-col gap-1">
              <div>{t('nft.standard')}</div>
              <div className="font-bold text-secondary">QRC-721</div>
            </div>
            <div className="flex flex-col gap-1">
              <div>{t('nft.ownedCount')}</div>
              <div className="font-bold text-secondary">{balance}</div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="gap-4">
          <Button
            className="w-full"
            type="button"
            variant="outline"
            onClick={onCancelImport}
          >
            <X className="mr-2 h-4 w-4" />
            {t('nft.cancelImport')}
          </Button>
          <Button className="w-full" type="button" onClick={onConfirmImport}>
            <Download className="mr-2 h-4 w-4" />
            {t('nft.confirmImport')}
          </Button>
        </CardFooter>
      </Card>
    );
  },
);

export default NFTCollectionImportSuccess;
