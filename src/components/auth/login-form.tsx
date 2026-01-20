"use client";

import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useRouter } from "@/i18n/routing";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useSignIn } from "@/hooks/api/use-auth";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { ROUTES } from "@/constants";
import { Captcha } from "./turnstile";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { useRef } from "react";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isCaptchaLoading, setIsCaptchaLoading] = useState(true);
  const captchaRef = useRef<TurnstileInstance>(null);

  const { mutate: signIn, isPending } = useSignIn();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      captchaToken: "",
    },
  });

  const onSubmit = (data: LoginInput) => {
    setServerError(null);
    signIn(data, {
      onSuccess: () => {
        router.replace(ROUTES.PROTECTED);
      },
      onError: (error) => {
        captchaRef.current?.reset();
        setValue("captchaToken", "");
        setIsCaptchaLoading(true);
        setServerError(error.message || t("errors.default"));
      },
    });
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-border/50 shadow-xl bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">{t("login")}</CardTitle>
          <CardDescription>{t("login_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <input type="hidden" {...register("captchaToken")} />
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  {...register("email")}
                  className={cn(errors.email && "border-destructive")}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t("password")}</Label>
                  <Link
                    href={ROUTES.AUTH.FORGOT_PASSWORD}
                    className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                  >
                    {t("forgot_password")}
                  </Link>
                </div>
                <PasswordInput
                  id="password"
                  {...register("password")}
                  className={cn(errors.password && "border-destructive")}
                />
                {errors.password && (
                  <p className="text-sm text-destructive">
                    {errors.password.message}
                  </p>
                )}
              </div>
            </div>

            {serverError && (
              <div className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-md">
                {serverError}
              </div>
            )}

            <Captcha
              ref={captchaRef}
              onSuccess={(token) => {
                setValue("captchaToken", token, { shouldValidate: true });
                setIsCaptchaLoading(false);
                // Clear captcha-related errors if we just got a fresh token
                if (serverError === t("errors.captcha_expired") || serverError === t("errors.captcha_failed")) {
                  setServerError(null);
                }
              }}
              onExpire={() => {
                setValue("captchaToken", "");
                setServerError(t("errors.captcha_expired"));
                setIsCaptchaLoading(true);
              }}
              onError={() => {
                setServerError(t("errors.captcha_failed"));
                setValue("captchaToken", "");
                setIsCaptchaLoading(false);
              }}
            />
            {errors.captchaToken && (
              <p className="text-sm text-destructive mt-[-1rem] mb-4 text-center">
                {errors.captchaToken.message}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={isPending || isCaptchaLoading}>
              {isPending ? t("loading") : t("submit_login")}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            {t("no_account")}{" "}
            <Link
              href={ROUTES.AUTH.SIGN_UP}
              className="text-primary hover:underline underline-offset-4 font-medium"
            >
              {t("signup")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
