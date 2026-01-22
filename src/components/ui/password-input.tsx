"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface PasswordInputProps extends Omit<React.ComponentProps<"input">, "type"> {
  showPasswordToggle?: boolean;
  isVisible?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, showPasswordToggle = true, isVisible: controlledVisible, onVisibilityChange, ...props }, ref) => {
    const [internalShowPassword, setInternalShowPassword] = React.useState(false);

    const isControlled = controlledVisible !== undefined;
    const showPassword = isControlled ? controlledVisible : internalShowPassword;

    const togglePasswordVisibility = () => {
      const nextVisible = !showPassword;
      if (!isControlled) {
        setInternalShowPassword(nextVisible);
      }
      onVisibilityChange?.(nextVisible);
    };

    // Use password type if disabled or if showPassword is false
    const type = showPassword && !props.disabled ? "text" : "password";

    return (
      <div className="relative">
        <Input
          type={type}
          className={cn("pr-10", className)}
          ref={ref}
          {...props}
        />
        {showPasswordToggle && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={togglePasswordVisibility}
            disabled={props.disabled}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword && !props.disabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
