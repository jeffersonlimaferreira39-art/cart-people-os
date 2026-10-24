import type { ComponentProps } from "react";
import { cn } from "./cn";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}
export const THead = (p: ComponentProps<"thead">) => <thead {...p} />;
export const TBody = (p: ComponentProps<"tbody">) => <tbody {...p} />;
export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-line px-4 py-2.5 text-left text-[12.5px] font-medium whitespace-nowrap text-ink-3",
        className,
      )}
      {...props}
    />
  );
}
export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-b border-line last:border-b-0 hover:bg-surface-2/60", className)} {...props} />;
}
export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle text-ink", className)} {...props} />;
}
