import { Button } from "@/components/UI/Button";
import { Card } from "@/components/UI/Card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/UI/Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/UI/DropdownMenu";
import { ROUTES } from "@/router/router";
import { useStore } from "@/stores/store";
import StorageUtil from "@/utilities/storageUtil";
import { getRandomTailwindTextColor } from "@/utilities/stylingUtil";
import {
  Check,
  CircleMinus,
  EllipsisVertical,
  Image,
  X,
} from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import TokenListItemLoading from "../../TokenListItemLoading/TokenListItemLoading";

type NFTCollectionItemProps = {
  contractAddress: string;
  triggerReRender?: () => void;
};

const NFTCollectionItem = observer(
  ({ contractAddress, triggerReRender }: NFTCollectionItemProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { qrlStore } = useStore();
    const { qrlConnection, activeAccount, getNftCollectionDetails } =
      qrlStore;
    const { blockchain } = qrlConnection;
    const { accountAddress } = activeAccount;

    const [collection, setCollection] =
      useState<
        Awaited<ReturnType<typeof getNftCollectionDetails>>["collection"]
      >();
    const [removeDialogOpen, setRemoveDialogOpen] = useState(false);

    useEffect(() => {
      (async () => {
        const details = await getNftCollectionDetails(contractAddress);
        if (!details.error) {
          setCollection(details.collection);
        }
      })();
    }, [blockchain, accountAddress]);

    const onRemove = async () => {
      setRemoveDialogOpen(false);
      await StorageUtil.clearFromNFTCollectionsList(
        accountAddress,
        contractAddress,
      );
      triggerReRender?.();
    };

    if (!collection) {
      return <TokenListItemLoading />;
    }

    return (
      <>
        <Card
          className="flex h-16 w-full animate-appear-in cursor-pointer items-center justify-between gap-4 p-4 text-foreground hover:ring-1 hover:ring-secondary"
          onClick={() =>
            navigate(ROUTES.NFT_GALLERY, {
              state: {
                contractAddress,
                collectionName: collection.name,
              },
            })
          }
        >
          <div className="flex items-center gap-4">
            <Image
              className={`shrink-0 ${getRandomTailwindTextColor(collection.symbol)}`}
              size={32}
            />
            <div className="flex w-full flex-col gap-1">
              <div className="text-xs font-bold">
                {t("nft.ownedNfts", { count: collection.balance })}
              </div>
              <div className="text-xs">{collection.name}</div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                className="size-7 hover:bg-accent hover:text-secondary"
                variant="outline"
                size="icon"
                aria-label={t("common.more")}
              >
                <EllipsisVertical size="16" />
              </Button>
            </DropdownMenuTrigger>
            {/* The menu renders in a DOM portal, but React events still bubble
                through the component tree to the Card's onClick, which opens
                the gallery. */}
            <DropdownMenuContent
              align="start"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="cursor-pointer data-[highlighted]:text-secondary"
                  onClick={() => setRemoveDialogOpen(true)}
                >
                  <div className="flex gap-2">
                    <CircleMinus size="16" />
                    <button aria-label={t("nft.removeCollection")}>
                      {t("nft.removeCollection")}
                    </button>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </Card>
        <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
          <DialogContent className="w-80 rounded-md">
            <DialogHeader className="text-left">
              <DialogTitle>{t("nft.removeCollection")}</DialogTitle>
              <DialogDescription>
                {t("nft.removeConfirm", { name: collection.name })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-row gap-4">
              <DialogClose asChild>
                <Button className="w-full" type="button" variant="outline">
                  <X className="mr-2 h-4 w-4" />
                  {t("common.no")}
                </Button>
              </DialogClose>
              <Button className="w-full" type="button" onClick={onRemove}>
                <Check className="mr-2 h-4 w-4" />
                {t("common.yes")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  },
);

export default NFTCollectionItem;
