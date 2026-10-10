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
import { Check, CircleMinus, EllipsisVertical, Send, X } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import TokenListItemIcon from "./TokenListItemIcon/TokenListItemIcon";

type TokenListItemProps = {
  isZrc20Token?: boolean;
  contractAddress?: string;
  decimals?: number;
  image: string;
  balance: string;
  name: string;
  symbol: string;
  triggerReRender?: () => void;
};

const TokenListItem = observer(
  ({
    isZrc20Token = false,
    contractAddress,
    decimals,
    image,
    balance,
    name,
    symbol,
    triggerReRender,
  }: TokenListItemProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { qrlStore } = useStore();
    const { activeAccount } = qrlStore;
    const { accountAddress } = activeAccount;

    const [hideDialogOpen, setHideDialogOpen] = useState(false);

    const onSend = () => {
      navigate(ROUTES.TOKEN_TRANSFER, {
        state: {
          tokenDetails: {
            isZrc20Token,
            tokenContractAddress: contractAddress,
            tokenDecimals: decimals,
            tokenImage: image,
            tokenBalance: balance,
            tokenName: name,
            tokenSymbol: symbol,
          },
        },
      });
    };

    const onHide = async () => {
      setHideDialogOpen(false);
      await StorageUtil.clearFromTokenContractsList(
        accountAddress,
        contractAddress ?? "",
      );
      triggerReRender?.();
    };

    return (
      <Card className="flex h-16 w-full animate-appear-in items-center justify-between gap-4 p-4 text-foreground">
        <div className="flex items-center gap-4">
          <TokenListItemIcon icon={image ?? ""} symbol={symbol} />
          <div className="flex w-full flex-col gap-1">
            <div className="text-xs font-bold">
              {balance === "Unavailable" ? t("common.unavailable") : balance}
            </div>
            <div className="text-xs">{name}</div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="size-7 hover:bg-accent hover:text-secondary"
              variant="outline"
              size="icon"
              aria-label={t('common.more')}
            >
              <EllipsisVertical size="16" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="cursor-pointer data-[highlighted]:text-secondary"
                onClick={onSend}
              >
                <div className="flex gap-2">
                  <Send size="16" />
                  <button aria-label={t('tokens.sendToken', { symbol })}>{t('tokens.sendToken', { symbol })}</button>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!isZrc20Token}
                className="cursor-pointer data-[highlighted]:text-secondary"
                onClick={() => setHideDialogOpen(true)}
              >
                <div className="flex gap-2">
                  <CircleMinus size="16" />
                  <button disabled={!isZrc20Token} aria-label={t('tokens.hideToken')}>
                    {t('tokens.hideToken')}
                  </button>
                </div>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={hideDialogOpen} onOpenChange={setHideDialogOpen}>
          <DialogContent className="w-80 rounded-md">
            <DialogHeader className="text-left">
              <DialogTitle>{t('tokens.hide')}</DialogTitle>
              <DialogDescription>
                {t('tokens.hideConfirm', { symbol })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-row gap-4">
              <DialogClose asChild>
                <Button
                  className="w-full"
                  type="button"
                  variant="outline"
                  aria-label={t('tokens.cancelHide')}
                >
                  <X className="mr-2 h-4 w-4" />
                  {t('common.no')}
                </Button>
              </DialogClose>
              <Button
                className="w-full"
                type="button"
                aria-label={t('tokens.confirmHide')}
                onClick={onHide}
              >
                <Check className="mr-2 h-4 w-4" />
                {t('common.yes')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    );
  },
);

export default TokenListItem;
