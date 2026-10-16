import { latencyStats } from "@/lib/atom/callAtom";
import type { ServedBy } from "@/lib/atom/types";
import type { BurstState } from "../hooks/useBurst";
import { ServedByChip } from "./ServedByChip";

const STATS = ["min", "avg", "p50", "p95", "max"] as const;

export const BurstStats = ({ burst }: { burst: BurstState }) => {
  const stats = latencyStats({ times: burst.times });
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center gap-3 text-xs text-tertiary-foreground">
        <span className="font-mono tabular-nums text-foreground">
          {burst.times.length}/{burst.total}
        </span>
        <span className="text-[#30A46C]">{burst.allowed} allowed</span>
        <span className="text-[#E5484D]">{burst.denied} denied</span>
        {burst.errors > 0 && <span>{burst.errors} errors</span>}
        <span className="ml-auto flex gap-1.5">
          {Object.entries(burst.servedBy).map(([servedBy, n]) => (
            <span key={servedBy} className="flex items-center gap-1">
              <ServedByChip servedBy={servedBy as ServedBy} />
              <span className="font-mono">{n}</span>
            </span>
          ))}
        </span>
      </div>
      {stats && (
        <div className="grid grid-cols-5 rounded-lg bg-muted py-2 text-center font-mono tabular-nums">
          {STATS.map((key) => (
            <div key={key}>
              <p className="text-[11px] text-tertiary-foreground">{key}</p>
              <p className="text-sm font-semibold text-foreground">{Math.round(stats[key])}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
