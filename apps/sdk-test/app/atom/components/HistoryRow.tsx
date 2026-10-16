import { Button } from "@autumn/ui";
import { errorMessageOf, outcomeOf, servedByOf } from "@/lib/atom/callAtom";
import { deltaOf, formatMs } from "../format";
import { lockFromEntry } from "../lockFromEntry";
import type { HeldLock, LogEntry } from "../types";
import { DeltaText } from "./DeltaText";
import { JsonBlock } from "./JsonBlock";
import { OutcomeChip } from "./OutcomeChip";
import { ServedByChip } from "./ServedByChip";

export const HistoryRow = ({
  entry,
  onRestoreLock,
}: {
  entry: LogEntry;
  onRestoreLock: (lock: HeldLock) => void;
}) => {
  const { result } = entry;
  const error = errorMessageOf({ result });
  const lock = lockFromEntry({ entry });
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm hover:bg-interactive-secondary-hover [&::-webkit-details-marker]:hidden">
        <OutcomeChip outcome={outcomeOf({ result })} />
        <span className="truncate text-foreground">{entry.label}</span>
        <DeltaText delta={deltaOf(entry)} className="text-xs" />
        <span className="ml-auto flex items-center gap-2">
          <ServedByChip servedBy={servedByOf({ attempts: result.attempts })} />
          <span className="w-12 text-right font-mono text-xs tabular-nums text-tertiary-foreground">
            {formatMs(result.ms)}
          </span>
        </span>
      </summary>
      <div className="flex flex-col gap-2 px-4 pb-3">
        {error && <p className="text-xs text-[#E5484D]">{error}</p>}
        {lock && (
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            onClick={() => onRestoreLock(lock)}
          >
            Add {lock.lockId} to Locks
          </Button>
        )}
        {result.attempts.map((attempt, i) => (
          <p
            key={`${attempt.url}-${i}`}
            className="flex gap-2 font-mono text-[11px] text-tertiary-foreground"
          >
            <span className="truncate">{attempt.url}</span>
            <span className="ml-auto text-foreground">{attempt.status ?? attempt.error}</span>
            <span>{formatMs(attempt.ms)}</span>
          </p>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <JsonBlock title="Request" value={result.attempts[0]?.requestBody} />
          <JsonBlock title="Response" value={result.attempts.at(-1)?.responseBody} />
        </div>
      </div>
    </details>
  );
};
