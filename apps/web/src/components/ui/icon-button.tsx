import * as React from "react";
import { cn } from "@/lib/utils";

export type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Accessible name, also shown as the hover/focus tooltip. */
  label: string;
  tone?: "default" | "danger";
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, tone = "default", className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      data-tip={label}
      data-tone={tone}
      className={cn("icon-btn", className)}
      {...props}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = "IconButton";
