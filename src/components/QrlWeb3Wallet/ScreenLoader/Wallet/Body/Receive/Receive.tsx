import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/UI/Card";
import { useStore } from "@/stores/store";
import StringUtil from "@/utilities/stringUtil";
import { observer } from "mobx-react-lite";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BackButton from "../../../Shared/BackButton/BackButton";
import CircuitBackground from "../../../Shared/CircuitBackground/CircuitBackground";

const Receive = observer(() => {
  const { t } = useTranslation();
  const { qrlStore } = useStore();
  const { activeAccount } = qrlStore;
  const { state } = useLocation();
  const accountAddress = state?.accountAddress ?? activeAccount.accountAddress;
  const displayAddress = StringUtil.getDisplayAddress(accountAddress);

  const { prefix, addressSplit } = StringUtil.getSplitAddress(displayAddress);
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    navigator.clipboard.writeText(displayAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  return (
    <div className="w-full">
      <CircuitBackground />
      <div className="relative z-10 p-8">
        <BackButton />
        <Card className="w-full">
          <CardHeader>
            <CardTitle>{t('receive.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="rounded-lg bg-white p-3">
              <QRCodeSVG value={displayAddress} size={150} />
            </div>
            <div className="flex items-start gap-2">
              <span className="break-all text-center text-sm text-secondary">
                {`${prefix} ${addressSplit.join(" ")}`}
              </span>
              <button
                onClick={onCopy}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={t('receive.copyAddress')}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
});

export default Receive;
