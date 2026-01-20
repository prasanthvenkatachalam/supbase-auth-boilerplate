"use client";

import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@/i18n/routing";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useSignUp } from "@/hooks/api/use-auth";
import { signUpSchema, type SignUpInput } from "@/lib/validations/auth";
import { ROUTES } from "@/constants";
import { Captcha } from "@/components/auth/turnstile";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { useRef } from "react";

export function SignUpForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const t = useTranslations("auth");
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isCaptchaLoading, setIsCaptchaLoading] = useState(true);
  const captchaRef = useRef<TurnstileInstance>(null);

  const { mutate: signUp, isPending } = useSignUp();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      captchaToken: "",
    },
  });

  const onSubmit = (data: SignUpInput) => {
    setServerError(null);
    signUp(data, {
      onSuccess: () => {
        setSuccess(true);
      },
      onError: (error) => {
        // Reset captcha on error
        captchaRef.current?.reset();
        setValue("captchaToken", "");
        setIsCaptchaLoading(true);

        // Enhanced error handling for rate limiting and other errors
        const errorMessage = error.message || t("errors.default");
        
        // Check if it's a rate limit error
        if (errorMessage.includes("Too many attempts") || errorMessage.includes("Rate limit")) {
          setServerError(errorMessage);
        } 
        // Check if email already exists
        else if (errorMessage.includes("already exists")) {
          setServerError("This email is already registered. Please use the login page.");
        }
        // Generic error
        else {
          setServerError(errorMessage);
        }
      },
    });
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-border/50 shadow-xl bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">{t("signup")}</CardTitle>
          <CardDescription>{t("signup_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="flex flex-col gap-4 text-center items-center justify-center py-6">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 mb-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-6 h-6"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="font-semibold text-lg">{t("check_email")}</h3>
              <p className="text-muted-foreground text-sm max-w-xs">
                {t("reset_sent").replace("reset", "confirmation")}
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link href={ROUTES.AUTH.LOGIN}>{t("back_to_login")}</Link>
              </Button>
            </div>
          ) : (
            <>
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
                      <p className="text-sm text-destructive">{errors.email.message}</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">{t("password")}</Label>
                    <PasswordInput
                      id="password"
                      placeholder="••••••••"
                      {...register("password")}
                      className={cn(errors.password && "border-destructive")}
                    />
                    {errors.password && (
                      <p className="text-sm text-destructive">{errors.password.message}</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="confirmPassword">{t("confirm_password")}</Label>
                    <PasswordInput
                      id="confirmPassword"
                      placeholder="••••••••"
                      {...register("confirmPassword")}
                      className={cn(errors.confirmPassword && "border-destructive")}
                    />
                    {errors.confirmPassword && (
                      <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
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
                  {isPending ? t("loading") : t("submit_signup")}
                </Button>
              </form>
              <div className="mt-6 text-center text-sm text-muted-foreground">
                {t("has_account")}{" "}
                <Link
                  href={ROUTES.AUTH.LOGIN}
                  className="text-primary hover:underline underline-offset-4 font-medium"
                >
                  {t("login")}
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
