import { cn } from "@/lib/utils";

export function Card({
  className,
  premium,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { premium?: boolean }) {
  return (
    <div
      className={cn(
        "glass-card rounded-[var(--radius)]",
        premium && "glass-card-premium",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pb-2", className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-base font-semibold tracking-tight text-[var(--fg)]", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-2", className)} {...props} />;
}
