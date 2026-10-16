import { useState } from "react";
import { responseBodyOf } from "@/lib/atom/callAtom";
import { loadLocks, saveLocks } from "../locksStorage";
import type { FinalizeLock, HeldLock } from "../types";
import type { RunAction } from "./useAtomRunner";

export type LocksApi = ReturnType<typeof useLocks>;

export const useLocks = ({ run, customerId }: { run: RunAction; customerId: string }) => {
  const [locks, setLocksState] = useState(loadLocks);
  const setLocks = (update: (prev: Array<HeldLock>) => Array<HeldLock>) =>
    setLocksState((prev) => {
      const next = update(prev);
      saveLocks({ locks: next });
      return next;
    });

  const finalize: FinalizeLock = async ({ lock, action, overrideValue }) => {
    const override = overrideValue === undefined ? "" : ` → ${overrideValue}`;
    const result = await run({
      label: `${action === "confirm" ? "Confirm" : "Release"}${override}`,
      call: {
        action: "finalize",
        params: { customerId, lockId: lock.lockId, action, overrideValue },
      },
    });
    const succeeded = responseBodyOf({ result })?.success === true;
    const settled = action === "confirm" ? "confirmed" : "released";
    setLocks((prev) =>
      prev.map((held) =>
        held.lockId === lock.lockId ? { ...held, status: succeeded ? settled : "failed" } : held,
      ),
    );
  };

  return {
    locks,
    finalize,
    add: (lock: HeldLock) =>
      setLocks((prev) => [lock, ...prev.filter((held) => held.lockId !== lock.lockId)]),
    clearSettled: () => setLocks((prev) => prev.filter((held) => held.status === "held")),
  };
};
