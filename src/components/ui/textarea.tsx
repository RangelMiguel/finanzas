import { cn } from "@/lib/utils";

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-[var(--fg-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40",
        className
      )}
      {...props}
    />
  );
}
