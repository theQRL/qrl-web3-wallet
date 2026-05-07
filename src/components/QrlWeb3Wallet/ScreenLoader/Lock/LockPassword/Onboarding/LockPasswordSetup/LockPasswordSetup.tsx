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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/UI/Form";
import { Input } from "@/components/UI/Input";
import { zodResolver } from "@hookform/resolvers/zod";
import { TFunction } from "i18next";
import { MoveRight } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ONBOARDING_STEPS, OnboardingStepType } from "../Onboarding";

const createFormSchema = (t: TFunction) =>
  z
    .object({
      password: z
        .string()
        .min(12, t("onboarding.password.validationMinLength")),
      reEnteredPassword: z
        .string()
        .min(12, t("onboarding.password.validationMinLength")),
    })
    .refine((fields) => fields.password === fields.reEnteredPassword, {
      message: t("onboarding.password.validationMismatch"),
      path: ["reEnteredPassword"],
    });

type LockPasswordSetupProps = {
  selectStep: (step: OnboardingStepType) => void;
  setNewPassword: (password: string) => void;
};

const LockPasswordSetup = ({
  selectStep,
  setNewPassword,
}: LockPasswordSetupProps) => {
  const { t } = useTranslation();
  const FormSchema = createFormSchema(t);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    mode: "onChange",
    reValidateMode: "onSubmit",
    defaultValues: {
      password: "",
      reEnteredPassword: "",
    },
  });
  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isValid },
  } = form;

  function onSubmit(formData: z.infer<typeof FormSchema>) {
    setNewPassword(formData?.reEnteredPassword);
    selectStep(ONBOARDING_STEPS.ADD_OR_IMPORT_ACCOUNT);
  }

  return (
    <Form {...form}>
      <form
        name="accountPasswordSetup"
        className="w-full"
        onSubmit={handleSubmit(onSubmit)}
      >
        <Card className="animate-appear-in shadow-xl">
          <CardHeader>
            <CardTitle>{t("onboarding.password.title")}</CardTitle>
            <CardDescription className="break-words">
              {t("onboarding.password.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      {...field}
                      aria-label={field.name}
                      disabled={isSubmitting}
                      placeholder={t("onboarding.password.placeholder")}
                      type="password"
                    />
                  </FormControl>
                  <FormDescription>{t("onboarding.password.inputDescription")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="reEnteredPassword"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      {...field}
                      aria-label={field.name}
                      disabled={isSubmitting}
                      placeholder={t("onboarding.password.confirmPlaceholder")}
                      type="password"
                    />
                  </FormControl>
                  <FormDescription>{t("onboarding.password.confirmDescription")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button disabled={!isValid} className="w-full">
              <MoveRight className="mr-2 h-4 w-4" />
              {t("onboarding.password.button")}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
};

export default LockPasswordSetup;
