import { errorMessageOf, outcomeOf, servedByOf } from "@/lib/atom/callAtom";
import { deltaOf, formatMs } from "../format";
import type { LogEntry } from "../types";
import { DeltaText } from "./DeltaText";
import { OutcomeChip } from "./OutcomeChip";
import { ServedByChip } from "./ServedByChip";

export const LastResult = ({ entry }: { entry: LogEntry | undefined }) => {
  if (!entry) return <p className="text-xs text-tertiary-foreground">No calls yet</p>;
  const error = errorMessageOf({ result: entry.result });
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm">
        <OutcomeChip outcome={outcomeOf({ result: entry.result })} />
        <span className="font-medium text-foreground">{entry.label}</span>
        <DeltaText delta={deltaOf(entry)} className="text-sm font-semibold" />
        <span className="ml-auto flex items-center gap-2">
          <ServedByChip servedBy={servedByOf({ attempts: entry.result.attempts })} />
          <span className="w-12 text-right font-mono text-xs tabular-nums text-tertiary-foreground">
            {formatMs(entry.result.ms)}
          </span>
        </span>
      </div>
      {error && <p className="truncate text-xs text-[#E5484D]">{error}</p>}
    </div>
  );
};
