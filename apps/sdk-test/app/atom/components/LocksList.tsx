import { Card } from "@autumn/ui";
import type { FinalizeLock, HeldLock } from "../types";
import { ListHeader } from "./ListHeader";
import { LockRow } from "./LockRow";

export const LocksList = ({
  locks,
  onFinalize,
  onClear,
}: {
  locks: Array<HeldLock>;
  onFinalize: FinalizeLock;
  onClear: () => void;
}) => {
  if (locks.length === 0) return null;
  return (
    <Card className="gap-0 divide-y divide-border py-0">
      <ListHeader title="Locks" clearLabel="Clear settled" onClear={onClear} />
      {locks.map((lock) => (
        <LockRow key={lock.lockId} lock={lock} onFinalize={onFinalize} />
      ))}
    </Card>
  );
};
