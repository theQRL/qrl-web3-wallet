import { Button } from "@/components/UI/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/UI/Card";
import { Checkbox } from "@/components/UI/Checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/UI/Dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/UI/Form";
import { Input } from "@/components/UI/Input";
import { Label } from "@/components/UI/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/UI/Select";
import { Separator } from "@/components/UI/Separator";
import { ROUTES } from "@/router/router";
import { useStore } from "@/stores/store";
import { zodResolver } from "@hookform/resolvers/zod";
import { TFunction } from "i18next";
import { Check, KeyRound, Loader, MoveLeft } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import CircuitBackground from "../../../Shared/CircuitBackground/CircuitBackground";

const createChangePasswordSchema = (t: TFunction) =>
  z
    .object({
      currentPassword: z.string().min(1, t("validation.passwordRequired")),
      newPassword: z
        .string()
        .min(12, t("onboarding.password.validationMinLength")),
      confirmNewPassword: z
        .string()
        .min(12, t("onboarding.password.validationMinLength")),
    })
    .refine(
      (fields) => fields.newPassword === fields.confirmNewPassword,
      {
        message: t("onboarding.password.validationMismatch"),
        path: ["confirmNewPassword"],
      },
    );

const SettingsSecurity = observer(() => {
  const navigate = useNavigate();
  const { settingsStore, lockStore, priceStore } = useStore();
  const { t } = useTranslation();
  const {
    autoLockMinutes,
    setAutoLockMinutes,
    showBalanceAndPrice,
    setShowBalanceAndPrice,
    notificationsEnabled,
    setNotificationsEnabled,
    phishingDetectionEnabled,
    setPhishingDetectionEnabled,
  } = settingsStore;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);

  const ChangePasswordSchema = createChangePasswordSchema(t);

  const form = useForm<z.infer<typeof ChangePasswordSchema>>({
    resolver: zodResolver(ChangePasswordSchema),
    mode: "onChange",
    reValidateMode: "onSubmit",
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    },
  });
  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isValid },
  } = form;

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      form.reset();
      setPasswordChanged(false);
    }
  };

  async function onChangePassword(
    formData: z.infer<typeof ChangePasswordSchema>,
  ) {
    setPasswordChanged(false);
    const success = await lockStore.changePassword(
      formData.currentPassword,
      formData.newPassword,
    );
    if (success) {
      setPasswordChanged(true);
      form.reset();
    } else {
      form.setError("currentPassword", {
        message: t("settings.security.incorrectPassword"),
      });
    }
  }

  const AUTO_LOCK_OPTIONS = [
    { value: "1", label: t("settings.security.1minute") },
    { value: "5", label: t("settings.security.5minutes") },
    { value: "15", label: t("settings.security.15minutes") },
    { value: "30", label: t("settings.security.30minutes") },
    { value: "60", label: t("settings.security.60minutes") },
    { value: "0", label: t("settings.security.never") },
  ];

  const handleTogglePrice = (checked: boolean | "indeterminate") => {
    const enabled = checked === true;
    setShowBalanceAndPrice(enabled);
    if (enabled) {
      priceStore.fetchPrices();
      priceStore.startAutoRefresh();
    } else {
      priceStore.stopAutoRefresh();
    }
  };

  return (
    <div className="w-full">
      <CircuitBackground />
      <div className="relative z-10 p-8">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MoveLeft
                className="cursor-pointer transition-all hover:text-secondary"
                onClick={() => navigate(ROUTES.SETTINGS)}
                data-testid="back-arrow"
              />
              {t("settings.security.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <Label className="mb-2 block text-xs text-muted-foreground">
                {t("settings.security.autoLockLabel")}
              </Label>
              <Select
                value={String(autoLockMinutes)}
                onValueChange={(value) => setAutoLockMinutes(Number(value))}
              >
                <SelectTrigger aria-label="Auto-lock timeout">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTO_LOCK_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-balance-price"
                  checked={showBalanceAndPrice}
                  onCheckedChange={handleTogglePrice}
                />
                <Label htmlFor="show-balance-price" className="text-sm">
                  {t("settings.security.showBalanceLabel")}
                </Label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("settings.security.showBalanceDescription")}
              </p>
            </div>
            <Separator />
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="notifications-enabled"
                  checked={notificationsEnabled}
                  onCheckedChange={(checked) =>
                    setNotificationsEnabled(checked === true)
                  }
                />
                <Label htmlFor="notifications-enabled" className="text-sm">
                  {t("settings.security.notificationsLabel")}
                </Label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("settings.security.notificationsDescription")}
              </p>
            </div>
            <Separator />
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="phishing-detection-enabled"
                  checked={phishingDetectionEnabled}
                  onCheckedChange={(checked) =>
                    setPhishingDetectionEnabled(checked === true)
                  }
                />
                <Label htmlFor="phishing-detection-enabled" className="text-sm">
                  {t("settings.security.phishingDetectionLabel")}
                </Label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("settings.security.phishingDetectionDescription")}
              </p>
            </div>
            <Separator />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setDialogOpen(true)}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              {t("settings.security.changePassword")}
            </Button>
          </CardContent>
        </Card>
      </div>
      <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="w-80 rounded-md">
          <DialogHeader className="text-left">
            <DialogTitle>{t("settings.security.changePassword")}</DialogTitle>
            <DialogDescription>
              {t("settings.security.changePasswordDescription")}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              name="changePassword"
              className="flex flex-col gap-3"
              onSubmit={handleSubmit(onChangePassword)}
            >
              <FormField
                control={control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        {...field}
                        aria-label={t("settings.security.currentPassword")}
                        type="password"
                        autoComplete="current-password"
                        disabled={isSubmitting}
                        placeholder={t("settings.security.currentPasswordPlaceholder")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        {...field}
                        aria-label={t("settings.security.newPassword")}
                        type="password"
                        autoComplete="new-password"
                        disabled={isSubmitting}
                        placeholder={t("settings.security.newPasswordPlaceholder")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="confirmNewPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        {...field}
                        aria-label={t("settings.security.confirmNewPassword")}
                        type="password"
                        autoComplete="new-password"
                        disabled={isSubmitting}
                        placeholder={t("settings.security.confirmNewPasswordPlaceholder")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                disabled={isSubmitting || !isValid}
                className="w-full"
                type="submit"
              >
                {isSubmitting ? (
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                ) : passwordChanged ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : null}
                {isSubmitting
                  ? t("settings.security.changingPassword")
                  : passwordChanged
                    ? t("settings.security.passwordChanged")
                    : t("settings.security.changePasswordButton")}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export default SettingsSecurity;
