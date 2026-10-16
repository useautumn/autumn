import { Card } from "@autumn/ui";
import type { HeldLock, LogEntry } from "../types";
import { HistoryRow } from "./HistoryRow";
import { ListHeader } from "./ListHeader";

export const HistoryList = ({
  entries,
  onClear,
  onRestoreLock,
}: {
  entries: Array<LogEntry>;
  onClear: () => void;
  onRestoreLock: (lock: HeldLock) => void;
}) => {
  if (entries.length === 0) return null;
  return (
    <Card className="gap-0 divide-y divide-border py-0">
      <ListHeader title="History" onClear={onClear} />
      {entries.map((entry) => (
        <HistoryRow key={entry.id} entry={entry} onRestoreLock={onRestoreLock} />
      ))}
    </Card>
  );
};
