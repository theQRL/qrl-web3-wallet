import { Button } from "@/components/UI/Button";
import { Card } from "@/components/UI/Card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/UI/DropdownMenu";
import { Input } from "@/components/UI/Input";
import { Label } from "@/components/UI/Label";
import { ROUTES } from "@/router/router";
import { useStore } from "@/stores/store";
import {
  Check,
  Copy,
  Download,
  EllipsisVertical,
  EyeOff,
  Pencil,
  Send,
  X,
} from "lucide-react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import AccountId from "../AccountId/AccountId";
import StringUtil from "@/utilities/stringUtil";

const ActiveAccount = observer(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { qrlStore, accountLabelsStore, hiddenAccountsStore } = useStore();
  const { activeAccount, qrlAccounts, setActiveAccount } = qrlStore;
  const { accountAddress } = activeAccount;

  const label = accountLabelsStore.getLabel(accountAddress);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const copyAccount = () => {
    navigator.clipboard.writeText(StringUtil.getDisplayAddress(accountAddress));
  };

  const startEdit = () => {
    setEditValue(label);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  const saveEdit = async () => {
    const trimmed = editValue.trim();
    if (trimmed) {
      await accountLabelsStore.setLabel(accountAddress, trimmed);
    }
    setIsEditing(false);
  };

  const visibleOtherAccounts = qrlAccounts.accounts.filter(
    ({ accountAddress: addr }) =>
      addr !== accountAddress && !hiddenAccountsStore.isHidden(addr),
  );
  const canHide = visibleOtherAccounts.length > 0;

  const hideActiveAccount = async () => {
    if (!canHide) return;
    const nextAccount = visibleOtherAccounts[0].accountAddress;
    await hiddenAccountsStore.hideAccount(accountAddress);
    await setActiveAccount(nextAccount);
  };

  return (
    !!accountAddress && (
      <div className="flex flex-col gap-2">
        <Label className="text-lg">{t('home.activeAccount')}</Label>
        <Card className="flex w-full flex-col gap-3 p-3 font-bold text-foreground">
          {isEditing && (
            <div className="flex items-center gap-1">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
                className="h-7 w-40 text-sm"
                autoFocus
                maxLength={50}
                aria-label={t('home.editAccountLabel')}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={saveEdit}
                aria-label={t('home.saveLabel')}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={cancelEdit}
                aria-label={t('home.cancelEdit')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <div className="flex w-full items-center gap-3">
            <div className="min-w-0 flex-1">
              <AccountId account={accountAddress} hideLabel={isEditing} />
            </div>
            <div className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <EllipsisVertical
                  size="16"
                  className="cursor-pointer"
                  data-testid="account-menu"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className="cursor-pointer data-[highlighted]:text-secondary"
                    onClick={() =>
                      navigate(ROUTES.TOKEN_TRANSFER, {
                        state: { shouldStartFresh: true },
                      })
                    }
                  >
                    <div className="flex gap-2">
                      <Send size="16" />
                      <span>{t('home.sendQuanta')}</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer data-[highlighted]:text-secondary"
                    onClick={() => navigate(ROUTES.RECEIVE)}
                  >
                    <div className="flex gap-2">
                      <Download size="16" />
                      <span>{t('home.receive')}</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer data-[highlighted]:text-secondary"
                    onClick={copyAccount}
                  >
                    <div className="flex gap-2">
                      <Copy size="16" />
                      <span>{t('home.copyAddress')}</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer data-[highlighted]:text-secondary"
                    onClick={startEdit}
                  >
                    <div className="flex gap-2">
                      <Pencil size="16" />
                      <span>{t('home.rename')}</span>
                    </div>
                  </DropdownMenuItem>
                  {canHide && (
                    <DropdownMenuItem
                      className="cursor-pointer data-[highlighted]:text-secondary"
                      onClick={hideActiveAccount}
                    >
                      <div className="flex gap-2">
                        <EyeOff size="16" />
                        <span>{t('home.hide')}</span>
                      </div>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </div>
        </Card>
      </div>
    )
  );
});

export default ActiveAccount;
