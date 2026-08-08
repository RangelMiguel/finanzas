import * as React from "react";
import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Money quantity — opens the decimal keypad on phones. */
  money?: boolean;
  /** Whole number (day, months, last-4) — integer keypad. */
  numeric?: boolean;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      money,
      numeric,
      inputMode,
      enterKeyHint,
      autoComplete,
      type,
      step,
      ...props
    },
    ref
  ) => {
    const resolvedMode =
      inputMode ??
      (money
        ? "decimal"
        : numeric
          ? "numeric"
          : type === "number"
            ? step != null && String(step).includes(".")
              ? "decimal"
              : "numeric"
            : undefined);

    return (
      <input
        ref={ref}
        type={type}
        step={step}
        inputMode={resolvedMode}
        enterKeyHint={
          enterKeyHint ?? (resolvedMode ? "done" : undefined)
        }
        autoComplete={
          autoComplete ?? (money || numeric ? "off" : undefined)
        }
        className={cn(
          "flex h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-[var(--fg)] shadow-inner shadow-black/20 placeholder:text-[var(--fg-faint)] transition-[border-color,box-shadow,background] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]/45 focus-visible:border-[var(--accent)]/50 focus-visible:bg-black/40",
          (money || numeric) && "tabular-nums",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
