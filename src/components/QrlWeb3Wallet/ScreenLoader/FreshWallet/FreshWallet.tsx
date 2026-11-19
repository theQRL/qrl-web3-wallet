import { Button } from "@/components/UI/Button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/UI/Card";
import { Checkbox } from "@/components/UI/Checkbox";
import { Label } from "@/components/UI/Label";
import { exportWalletBackup } from "@/functions/exportWalletBackup";
import { useStore } from "@/stores/store";
import { Download, Loader } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import CircuitBackground from "../Shared/CircuitBackground/CircuitBackground";

/**
 * Shown when extension storage holds a wallet from an earlier test build.
 * This build does not open that wallet. The screen offers the backup export
 * and then, on the user's confirmation, removes the stored wallet so a new
 * one can be set up.
 */
const FreshWallet = () => {
  const { t } = useTranslation();
  const { lockStore } = useStore();
  const [confirmed, setConfirmed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");

  const exportBackup = async () => {
    setExporting(true);
    setError("");
    try {
      await exportWalletBackup();
    } catch {
      setError(t("freshWallet.exportError"));
    } finally {
      setExporting(false);
    }
  };

  const startFresh = async () => {
    setResetting(true);
    setError("");
    try {
      await lockStore.resetOutdatedStorage();
      window.location.reload();
    } catch {
      setError(t("freshWallet.resetError"));
      setResetting(false);
    }
  };

  return (
    <div className="w-full">
      <CircuitBackground />
      <div className="relative z-10 p-8">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>{t("freshWallet.title")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm">{t("freshWallet.description")}</p>
            <p className="text-xs text-muted-foreground">
              {t("freshWallet.backupNote")}
            </p>
            <Button
              className="w-full"
              type="button"
              variant="outline"
              disabled={exporting || resetting}
              onClick={() => {
                void exportBackup();
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting
                ? t("settings.data.exportingButton")
                : t("settings.data.exportButton")}
            </Button>
            <div className="flex items-start gap-2">
              <Checkbox
                id="fresh-wallet-confirm"
                checked={confirmed}
                disabled={resetting}
                onCheckedChange={(checked) => {
                  setConfirmed(checked === true);
                }}
              />
              <Label htmlFor="fresh-wallet-confirm" className="leading-5">
                {t("freshWallet.confirm")}
              </Label>
            </div>
            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              type="button"
              variant="destructive"
              disabled={!confirmed || resetting}
              onClick={() => {
                void startFresh();
              }}
            >
              {resetting && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              {t("freshWallet.resetButton")}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default FreshWallet;
