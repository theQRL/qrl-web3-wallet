import { Button } from "@/components/UI/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/UI/Card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/UI/Dialog";
import FullAddress from "@/components/QrlWeb3Wallet/ScreenLoader/Shared/FullAddress/FullAddress";
import { getMnemonicFromHexSeed } from "@/functions/getMnemonicFromHexSeed";
import withSuspense from "@/functions/withSuspense";
import { Web3BaseWalletAccount } from "@theqrl/web3";
import { ArrowRight, HardDriveDownload, Undo } from "lucide-react";
import { lazy } from "react";
import { useTranslation } from "react-i18next";
import HexSeedListing from "./HexSeedListing/HexSeedListing";
import StringUtil from "@/utilities/stringUtil";

const MnemonicWordListing = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/CreateAccount/MnemonicDisplay/MnemonicWordListing/MnemonicWordListing"
      ),
  ),
);

type MnemonicDisplayProps = {
  account?: Web3BaseWalletAccount;
  onMnemonicNoted: () => void;
};

const MnemonicDisplay = ({
  account,
  onMnemonicNoted,
}: MnemonicDisplayProps) => {
  const { t } = useTranslation();
  const accountAddress = account?.address;
  const accountHexSeed = account?.seed;
  const mnemonicPhrases = getMnemonicFromHexSeed(accountHexSeed);

  const onDownload = () => {
    if (account) StringUtil.downloadRecoveryPhrases(account);
  };

  const cardDescription = t('mnemonic.description');
  const continueWarning = t('mnemonic.continueWarning');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('mnemonic.keepSafe')}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
        {/*
          The address used to be interpolated into the sentence above as
          `head-6 ... tail-5` — 11 of 129 characters. Truncation in prose reads as
          a definitive identifier while conveying almost none of one, so the
          address is now rendered in full below the sentence instead.
        */}
        {accountAddress && (
          <FullAddress
            address={accountAddress}
            className="pt-1 font-mono text-xs text-muted-foreground"
          />
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <HexSeedListing hexSeed={accountHexSeed} />
        <MnemonicWordListing mnemonic={mnemonicPhrases} />
      </CardContent>
      <CardFooter className="gap-4">
        <Button
          className="w-full"
          type="button"
          variant="constructive"
          onClick={onDownload}
        >
          <HardDriveDownload className="mr-2 h-4 w-4" />
          {t('mnemonic.download')}
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="w-full" type="button">
              <ArrowRight className="mr-2 h-4 w-4" />
              {t('mnemonic.continue')}
            </Button>
          </DialogTrigger>
          <DialogContent className="w-80 rounded-md">
            <DialogHeader className="text-left">
              <DialogTitle>{t('mnemonic.important')}</DialogTitle>
              <DialogDescription>{continueWarning}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-row gap-4">
              <DialogClose asChild>
                <Button className="w-full" type="button" variant="outline">
                  <Undo className="mr-2 h-4 w-4" />
                  {t('mnemonic.goBack')}
                </Button>
              </DialogClose>
              <Button
                className="w-full"
                type="button"
                onClick={onMnemonicNoted}
              >
                <ArrowRight className="mr-2 h-4 w-4" />
                {t('mnemonic.continue')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
};

export default MnemonicDisplay;
