import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/UI/Dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/UI/tabs";
import { useStore } from "@/stores/store";
import StringUtil from "@/utilities/stringUtil";
import { BookUser, Users, Wallet, History } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo } from "react";

type RecipientPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (address: string) => void;
};

type AddressRowProps = {
  address: string;
  label?: string;
  onClick: () => void;
};

const AddressRow = ({ address, label, onClick }: AddressRowProps) => {
  const { prefix, addressSplit } = StringUtil.getSplitAddress(address);

  return (
    <button
      className="flex w-full min-w-0 flex-col gap-0.5 rounded-md border p-2 text-left transition-colors hover:bg-accent"
      onClick={onClick}
    >
      {label && (
        <span className="max-w-full break-words text-sm font-medium">
          {label}
        </span>
      )}
      <span className="max-w-full whitespace-normal break-words text-xs leading-relaxed text-muted-foreground">
        {prefix}
        {addressSplit.join(" ")}
      </span>
    </button>
  );
};

const RecipientPicker = observer(
  ({ open, onOpenChange, onSelect }: RecipientPickerProps) => {
    const { t } = useTranslation();
    const {
      qrlStore,
      contactsStore,
      transactionHistoryStore,
      ledgerStore,
      accountLabelsStore,
    } = useStore();
    const { activeAccount, qrlAccounts } = qrlStore;
    const { accountAddress } = activeAccount;
    const { contacts } = contactsStore;
    const { transactions } = transactionHistoryStore;

    useEffect(() => {
      if (open) {
        contactsStore.loadContacts();
        accountLabelsStore.syncLabels(
          qrlAccounts.accounts ?? [],
          ledgerStore.isLedgerAccount.bind(ledgerStore),
        );
      }
    }, [open]);

    const otherAccounts = useMemo(
      () =>
        (qrlAccounts.accounts ?? [])
          .map((a) => ({
            address: a.accountAddress,
            label:
              accountLabelsStore.getLabel(a.accountAddress) ||
              a.accountAddress,
          }))
          .filter(
            (a) => a.address.toLowerCase() !== accountAddress.toLowerCase(),
          ),
      [qrlAccounts.accounts, accountAddress, accountLabelsStore.labels],
    );

    const recentAddresses = useMemo(() => {
      const seen = new Set<string>();
      const result: string[] = [];
      for (const tx of transactions) {
        const lower = tx.to.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          result.push(tx.to);
        }
      }
      return result;
    }, [transactions]);

    const handleSelect = (address: string) => {
      onSelect(address);
      onOpenChange(false);
    };

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={t('recipient.openAddressBook')}
            className="shrink-0 rounded p-2 text-muted-foreground transition-colors hover:text-secondary"
          >
            <BookUser size={18} />
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('recipient.dialogTitle')}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="accounts">
            <TabsList className="w-full">
              <TabsTrigger value="accounts" className="flex-1">
                {t('recipient.tabAccounts')}
              </TabsTrigger>
              <TabsTrigger value="contacts" className="flex-1">
                {t('recipient.tabContacts')}
              </TabsTrigger>
              <TabsTrigger value="recent" className="flex-1">
                {t('recipient.tabRecent')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="accounts">
              {otherAccounts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                  <Wallet className="h-8 w-8" />
                  <p className="text-sm">{t('recipient.emptyAccounts')}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {otherAccounts.map((a) => (
                    <AddressRow
                      key={a.address}
                      address={a.address}
                      label={a.label}
                      onClick={() => handleSelect(a.address)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="contacts">
              {contacts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                  <Users className="h-8 w-8" />
                  <p className="text-sm">{t('recipient.emptyContacts')}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {contacts.map((c) => (
                    <AddressRow
                      key={c.address}
                      address={c.address}
                      label={c.name}
                      onClick={() => handleSelect(c.address)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="recent">
              {recentAddresses.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                  <History className="h-8 w-8" />
                  <p className="text-sm">{t('recipient.emptyRecent')}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {recentAddresses.map((addr) => (
                    <AddressRow
                      key={addr}
                      address={addr}
                      onClick={() => handleSelect(addr)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    );
  },
);

export default RecipientPicker;
