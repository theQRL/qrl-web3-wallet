import { Button } from "@/components/UI/Button";
import { Label } from "@/components/UI/Label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/UI/Tooltip";
import { getHexSeedFromMnemonic } from "@/functions/getHexSeedFromMnemonic";
import { useStore } from "@/stores/store";
import StringUtil, { sanitizeForDisplay } from "@/utilities/stringUtil";
import { MLDSA87, ExtendedSeed } from "@theqrl/wallet.js";
import { bytesToHex } from "@theqrl/web3-utils";
import { parseAndValidateSeed } from "@theqrl/web3-qrl-accounts";
import { Buffer } from "buffer";
import { Copy } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";

const PersonalSign = observer(() => {
  const { t } = useTranslation();
  const { lockStore, qrlStore, dAppRequestStore } = useStore();
  const { getMnemonicPhrases } = lockStore;
  const { qrlInstance, qrlConnection } = qrlStore;
  const { isConnected } = qrlConnection;
  const {
    dAppRequestData,
    setOnPermissionCallBack,
    setCanProceed,
    addToResponseData,
  } = dAppRequestStore;

  const params = dAppRequestData?.params;
  const rawMessage: string = params?.[0] ?? "";
  const messageWithoutPrefix =
    rawMessage.startsWith("0x") || rawMessage.startsWith("0X")
      ? rawMessage.slice(2)
      : rawMessage;
  const isHexEncoded =
    /^[0-9a-f]+$/i.test(messageWithoutPrefix) &&
    messageWithoutPrefix.length % 2 === 0;
  const decodedChallenge = isHexEncoded
    ? Buffer.from(messageWithoutPrefix, "hex").toString("utf8")
    : rawMessage;
  const { sanitized: challenge, hadHidden: hasHiddenChars } =
    sanitizeForDisplay(decodedChallenge);
  const fromAddress = params?.[1] ?? "";
  const { prefix: prefixFromAddress, addressSplit: addressSplitFromAddress } =
    StringUtil.getSplitAddress(fromAddress);

  useEffect(() => {
    if (isConnected) {
      const onPermissionCallBack = async (hasApproved: boolean) => {
        if (hasApproved) {
          personalSign();
        }
      };
      setOnPermissionCallBack(onPermissionCallBack);
    }
  }, [isConnected]);

  const copyMessage = () => {
    navigator.clipboard.writeText(challenge);
  };

  const personalSign = async () => {
    try {
      const mnemonicPhrases = await getMnemonicPhrases(fromAddress ?? "");
      const seed = getHexSeedFromMnemonic(mnemonicPhrases);
      const addressFromMnemonic =
        qrlInstance?.accounts.seedToAccount(seed)?.address;
      if (fromAddress !== addressFromMnemonic) {
        throw new Error("Mnemonic phrases did not match with the address");
      }
      const signature = qrlInstance?.accounts.sign(
        params?.[0],
        seed,
      )?.signature;

      const seedUint8Array = parseAndValidateSeed(seed);
      const extSeed = new ExtendedSeed(seedUint8Array);
      const acc = MLDSA87.newWalletFromExtendedSeed(extSeed);
      const publicKey = bytesToHex(acc.getPK());

      if (signature && publicKey) {
        addToResponseData({
          signature,
          publicKey,
        });
      } else {
        throw new Error("Message data could not be signed");
      }
    } catch (error) {
      addToResponseData({ error });
    }
  };

  useEffect(() => {
    setCanProceed(true);
  }, []);

  return (
    <div className="flex flex-col gap-2 rounded-md p-2">
      <div className="flex flex-col gap-1">
        <div>{t('dapp.signature.fromAddress')}</div>
        <div className="w-64 font-bold text-secondary">{`${prefixFromAddress} ${addressSplitFromAddress.join(" ")}`}</div>
      </div>
      <div className="flex flex-col gap-1">
        <div>{t('dapp.signature.message')}</div>
        {!isHexEncoded && (
          <div className="text-xs text-yellow-600">
            Message is not hex-encoded; displaying raw input.
          </div>
        )}
        {hasHiddenChars && (
          <div className="text-xs text-red-600">
            Warning: this message contained hidden formatting characters
            (bidirectional, zero-width, or control); they have been removed
            from the display. The bytes signed will still include them.
          </div>
        )}
        <div className="flex justify-between gap-2">
          <div className="max-h-[8rem] w-full overflow-hidden break-words font-bold text-secondary">
            {challenge}
          </div>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                className="h-7 w-8 hover:text-secondary"
                variant="outline"
                size="icon"
                aria-label="Copy message"
                onClick={copyMessage}
              >
                <Copy size="16" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <Label>{t('dapp.signature.copyMessage')}</Label>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
});

export default PersonalSign;
