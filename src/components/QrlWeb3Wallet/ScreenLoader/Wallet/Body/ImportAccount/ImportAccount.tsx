import { Alert, AlertDescription } from "@/components/UI/Alert";
import { Button } from "@/components/UI/Button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/UI/Card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/UI/Form";
import { Input } from "@/components/UI/Input";
import { getHexSeedFromMnemonic } from "@/functions/getHexSeedFromMnemonic";
import withSuspense from "@/functions/withSuspense";
import { useStore } from "@/stores/store";
import { zodResolver } from "@hookform/resolvers/zod";
import { Web3BaseWalletAccount } from "@theqrl/web3";
import { Download, Loader } from "lucide-react";
import { observer } from "mobx-react-lite";
import { lazy, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import BackButton from "../../../Shared/BackButton/BackButton";
import CircuitBackground from "../../../Shared/CircuitBackground/CircuitBackground";

const MnemonicWordListing = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/CreateAccount/MnemonicDisplay/MnemonicWordListing/MnemonicWordListing"
      ),
  ),
);
const AccountImportSuccess = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/ImportAccount/AccountImportSuccess/AccountImportSuccess"
      ),
  ),
);

const FormSchema = z.object({
  mnemonicPhrases: z.string().min(1, "Mnemonic phrases are required"),
});

const ImportAccount = observer(() => {
  const { t } = useTranslation();
  const [account, setAccount] = useState<Web3BaseWalletAccount>();
  const [hasAccountImported, setHasAccountImported] = useState(false);
  const [finalizeError, setFinalizeError] = useState("");
  const { lockStore, qrlStore } = useStore();
  const { encryptAccount, getWalletPassword } = lockStore;
  const { qrlInstance, setActiveAccount } = qrlStore;

  async function onSubmit(formData: z.infer<typeof FormSchema>) {
    setFinalizeError("");
    try {
      const account = qrlInstance?.accounts.seedToAccount(
        getHexSeedFromMnemonic(formData.mnemonicPhrases.trim()),
      );
      if (account) {
        window.scrollTo(0, 0);
        // Fail closed before touching storage: the wallet can read as
        // unlocked (its decrypted keys self-healed from session storage
        // after a service-worker restart) while the memory-only wallet
        // password is gone. Checking it, and persisting the keystore,
        // before setActiveAccount means a spent session never leaves the
        // imported address in the accounts list pointing at a keystore
        // that was never written.
        let password: string;
        try {
          password = await getWalletPassword();
        } catch {
          setFinalizeError(t("account.passwordUnavailable"));
          return;
        }
        setAccount(account);
        try {
          await encryptAccount(account, password);
        } catch {
          setFinalizeError(t("account.passwordUnavailable"));
          return;
        }
        await setActiveAccount(account.address);
        setHasAccountImported(true);
      } else {
        control.setError("mnemonicPhrases", {
          message: t('importAccount.importFailed'),
        });
      }
    } catch (error) {
      control.setError("mnemonicPhrases", {
        message: `${t('importAccount.readError')} ${error}`,
      });
    }
  }

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: "onChange",
    reValidateMode: "onSubmit",
    defaultValues: {
      mnemonicPhrases: "",
    },
  });
  const {
    handleSubmit,
    watch,
    control,
    formState: { isSubmitting, isValid },
  } = form;

  return (
    <>
      <CircuitBackground />
      <div className="relative z-10 p-8">
        {hasAccountImported ? (
          <AccountImportSuccess account={account} />
        ) : (
          <Form {...form}>
            <BackButton />
            {finalizeError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{finalizeError}</AlertDescription>
              </Alert>
            )}
            <form
              name="importAccount"
              aria-label="importAccount"
              className="w-full"
              onSubmit={handleSubmit(onSubmit)}
            >
              <Card>
                <CardHeader>
                  <CardTitle>{t('importAccount.title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={control}
                    name="mnemonicPhrases"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            {...field}
                            aria-label={field.name}
                            autoComplete="off"
                            disabled={isSubmitting}
                            placeholder={t('mnemonic.phrases')}
                          />
                        </FormControl>
                        <FormDescription>
                          {t('importAccount.pasteMnemonic')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <MnemonicWordListing mnemonic={watch().mnemonicPhrases} />
                </CardContent>
                <CardFooter>
                  <Button
                    disabled={isSubmitting || !isValid}
                    className="w-full"
                    type="submit"
                  >
                    {isSubmitting ? (
                      <Loader className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    {isSubmitting ? t('importAccount.importing') : t('importAccount.button')}
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </Form>
        )}
      </div>
    </>
  );
});

export default ImportAccount;
