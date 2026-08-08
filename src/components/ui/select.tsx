import { cn } from "@/lib/utils";

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-[var(--fg)] shadow-inner shadow-black/20 transition-[border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]/45 focus-visible:border-[var(--accent)]/50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
