import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Separator = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn("h-px w-full bg-zinc-200 dark:bg-zinc-800", className)}
      {...props}
    />
  );
};
