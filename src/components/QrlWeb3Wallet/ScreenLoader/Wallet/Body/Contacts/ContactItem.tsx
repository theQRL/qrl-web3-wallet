import FullAddress from "@/components/QrlWeb3Wallet/ScreenLoader/Shared/FullAddress/FullAddress";
import type { Contact } from "@/types/contact";
import { Pencil, Trash2 } from "lucide-react";

type ContactItemProps = {
  contact: Contact;
  onEdit: (contact: Contact) => void;
  onDelete: (address: string) => void;
};

const ContactItem = ({ contact, onEdit, onDelete }: ContactItemProps) => {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium">{contact.name}</span>
        {/*
          Two mistakes were combined here: `addressSplit.join("")` collapsed the
          chunks back into one unbreakable string, defeating the helper that
          produced them, and `truncate` then clipped it to whatever fitted — head
          only, tail invisible. A contact is selectable as a transfer recipient,
          so that is the exact surface where a poisoned address hides.
        */}
        <FullAddress
          address={contact.address}
          className="text-xs text-muted-foreground"
        />
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          aria-label="Edit contact"
          className="rounded p-1 text-muted-foreground transition-colors hover:text-secondary"
          onClick={() => onEdit(contact)}
        >
          <Pencil size={14} />
        </button>
        <button
          aria-label="Delete contact"
          className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
          onClick={() => onDelete(contact.address)}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

export default ContactItem;
