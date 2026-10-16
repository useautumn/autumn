import { cn } from "@autumn/ui";
import { formatDelta } from "../format";

export const DeltaText = ({ delta, className }: { delta: number | null; className?: string }) => {
  if (delta === null) return null;
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        delta < 0 && "text-[#E5484D]",
        delta > 0 && "text-[#30A46C]",
        delta === 0 && "text-tertiary-foreground",
        className,
      )}
    >
      {formatDelta(delta)}
    </span>
  );
};
