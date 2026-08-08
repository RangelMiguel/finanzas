import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-deep)] disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "btn-primary font-semibold text-[#081018] shadow-[0_10px_28px_var(--accent-glow)] hover:brightness-110 hover:-translate-y-0.5",
        secondary:
          "bg-white/[0.06] text-[var(--fg)] border border-white/10 hover:bg-white/[0.1] hover:border-white/20",
        outline:
          "border border-white/15 bg-transparent text-[var(--fg)] hover:bg-white/[0.05]",
        danger:
          "bg-gradient-to-br from-rose-400 to-rose-600 text-white hover:brightness-110",
        ghost: "text-[var(--fg-muted)] hover:bg-white/[0.06] hover:text-[var(--fg)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
);
Button.displayName = "Button";
