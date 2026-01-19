"use client";

import { Turnstile, type TurnstileInstance, type TurnstileProps } from "@marsidev/react-turnstile";
import { forwardRef } from "react";

interface CaptchaProps extends Omit<TurnstileProps, "siteKey"> {
  siteKey?: string;
}

export const Captcha = forwardRef<TurnstileInstance, CaptchaProps>(
  ({ siteKey, ...props }, ref) => {
    const defaultSiteKey = 
      process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY || 
      process.env.NEXT_PUBLIC_CLOUDFLARE_TRUSTLINE_SITE_KEY_NON_INTERACTIVE || 
      "";

    if (!defaultSiteKey && !siteKey) {
      console.warn("Turnstile site key is missing");
      return null;
    }

    return (
      <div className="flex justify-center w-full my-4">
        <Turnstile
          ref={ref}
          siteKey={siteKey || defaultSiteKey}
          {...props}
        />
      </div>
    );
  }
);

Captcha.displayName = "Captcha";
