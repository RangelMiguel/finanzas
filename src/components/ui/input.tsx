import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]/50 focus-visible:border-[var(--accent)]/40",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";
