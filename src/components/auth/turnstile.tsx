"use client";

import { Turnstile, type TurnstileInstance, type TurnstileProps } from "@marsidev/react-turnstile";
import { forwardRef } from "react";

interface CaptchaProps extends Omit<TurnstileProps, "siteKey"> {
  siteKey?: string;
}

export const Captcha = forwardRef<TurnstileInstance, CaptchaProps>(
  ({ siteKey, options, ...props }, ref) => {
    const defaultSiteKey = 
      process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY || 
      process.env.NEXT_PUBLIC_CLOUDFLARE_TRUSTLINE_SITE_KEY_NON_INTERACTIVE || 
      "";

    if (!defaultSiteKey && !siteKey) {
      console.warn("Turnstile site key is missing");
      return null;
    }

    // Default options for non-interactive mode if not provided
    const mergedOptions = {
      appearance: "always" as const,
      size: "normal" as const,
      ...options,
    };

    return (
      <div className="flex justify-center w-full my-2">
        <Turnstile
          ref={ref}
          siteKey={siteKey || defaultSiteKey}
          options={mergedOptions}
          {...props}
        />
      </div>
    );
  }
);

Captcha.displayName = "Captcha";
