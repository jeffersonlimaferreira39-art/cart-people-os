import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export function buttonClasses(variant: Variant = "primary", size: Size = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium whitespace-nowrap",
    "transition-colors disabled:cursor-not-allowed disabled:opacity-55",
    size === "md" ? "h-9 px-3.5 text-sm" : "h-8 px-2.5 text-[13px]",
    variant === "primary" &&
      "bg-accent text-accent-ink shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent)_60%,transparent),0_6px_20px_-8px_var(--accent)] hover:bg-accent-hover",
    variant === "secondary" && "border border-line-strong bg-surface/70 text-ink hover:border-accent/60 hover:bg-surface-2",
    variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
    variant === "danger" && "border border-danger/40 bg-surface text-danger hover:bg-danger-soft",
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={cn(buttonClasses(variant, size), className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={cn(buttonClasses(variant, size), className)} {...props} />;
}
