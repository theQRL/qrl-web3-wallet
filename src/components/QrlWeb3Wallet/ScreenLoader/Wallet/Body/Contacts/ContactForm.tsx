import { Button } from "@/components/UI/Button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/UI/Form";
import { Input } from "@/components/UI/Input";
import { Label } from "@/components/UI/Label";
import type { Contact } from "@/types/contact";
import AddressUtil from "@/utilities/addressUtil";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save, X } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

const createContactFormSchema = (existingAddresses: string[]) =>
  z
    .object({
      name: z
        .string()
        .min(1, "Name is required")
        .max(50, "Name must be 50 characters or less"),
      address: z.string().min(1, "Address is required"),
    })
    .refine((fields) => AddressUtil.isQrlAddress(fields.address.trim()), {
      message: "Address is invalid",
      path: ["address"],
    })
    .refine(
      (fields) =>
        !existingAddresses.some(
          (a) => a.toLowerCase() === fields.address.toLowerCase(),
        ),
      {
        message: "Contact with this address already exists",
        path: ["address"],
      },
    );

type ContactFormProps = {
  initialContact?: Contact;
  existingAddresses?: string[];
  onSave: (contact: Contact) => void;
  onCancel: () => void;
};

const ContactForm = ({
  initialContact,
  existingAddresses = [],
  onSave,
  onCancel,
}: ContactFormProps) => {
  const { t } = useTranslation();
  // In edit mode, exclude the current address from the duplicate check
  const addressesToCheck = useMemo(
    () =>
      initialContact
        ? existingAddresses.filter(
            (a) =>
              a.toLowerCase() !== initialContact.address.toLowerCase(),
          )
        : existingAddresses,
    [existingAddresses, initialContact],
  );

  const schema = useMemo(
    () => createContactFormSchema(addressesToCheck),
    [addressesToCheck],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      name: initialContact?.name ?? "",
      address: initialContact?.address ?? "",
    },
  });

  const {
    handleSubmit,
    control,
    formState: { isValid },
  } = form;

  const onSubmit = (data: z.infer<typeof schema>) => {
    onSave({ name: data.name, address: data.address });
  };

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <FormField
          control={control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <Label>{t('contacts.nameLabel')}</Label>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="off"
                  placeholder="Contact name"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <Label>{t('contacts.addressLabel')}</Label>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="off"
                  placeholder="Q address"
                  disabled={!!initialContact}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onCancel}
          >
            <X className="mr-2 h-4 w-4" />
            {t('contacts.cancelButton')}
          </Button>
          <Button type="submit" disabled={!isValid} className="flex-1">
            <Save className="mr-2 h-4 w-4" />
            {t('contacts.saveButton')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default ContactForm;
