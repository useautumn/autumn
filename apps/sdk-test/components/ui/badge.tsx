import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "ready" | "planned" | "wip" | "default";

const variantClasses: Record<BadgeVariant, string> = {
  default:
    "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  ready:
    "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
  planned:
    "border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400",
  wip: "border-zinc-500 bg-zinc-900 text-zinc-100 dark:border-zinc-300 dark:bg-zinc-100 dark:text-zinc-900",
};

export const Badge = ({
  className,
  children,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) => {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
};
