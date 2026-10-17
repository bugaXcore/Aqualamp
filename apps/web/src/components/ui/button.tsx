import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "lg" | "sm";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/70 disabled:pointer-events-none disabled:opacity-45",
          variant === "default" &&
            "bg-teal-400 text-slate-950 shadow-[0_0_28px_rgba(45,212,191,0.35)] hover:bg-teal-300 hover:shadow-[0_0_36px_rgba(45,212,191,0.45)]",
          variant === "ghost" &&
            "bg-transparent text-teal-100/90 hover:bg-white/5 hover:text-white",
          variant === "outline" &&
            "border border-teal-200/25 bg-white/5 text-teal-50 hover:border-teal-200/45 hover:bg-white/10",
          size === "default" && "h-11 px-5 text-sm",
          size === "lg" && "h-13 px-8 text-base",
          size === "sm" && "h-9 px-3.5 text-xs",
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
