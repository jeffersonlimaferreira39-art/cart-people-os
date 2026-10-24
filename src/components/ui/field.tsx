import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-sm text-ink " +
  "placeholder:text-ink-3 focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 " +
  "disabled:bg-surface-2 disabled:text-ink-3 aria-[invalid=true]:border-danger";

export function Field({
  label,
  name,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  name: string;
  hint?: ReactNode;
  error?: string[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={name} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error?.length ? (
        <p id={`${name}-error`} className="text-[13px] text-danger">
          {error[0]}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      id={props.id ?? props.name}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${props.name}-error` : undefined}
      className={cn(control, "h-9", className)}
      {...props}
    />
  );
}

export function Select({ className, invalid, ...props }: ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <select
      id={props.id ?? props.name}
      aria-invalid={invalid || undefined}
      className={cn(control, "h-9 pr-8", className)}
      {...props}
    />
  );
}

export function Textarea({ className, invalid, ...props }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      id={props.id ?? props.name}
      aria-invalid={invalid || undefined}
      className={cn(control, "min-h-20 py-2", className)}
      {...props}
    />
  );
}
