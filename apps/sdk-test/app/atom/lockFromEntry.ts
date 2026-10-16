import { outcomeOf } from "@/lib/atom/callAtom";
import type { HeldLock, LogEntry } from "./types";

type LockRequestBody = {
  required_balance?: number;
  lock?: { lock_id?: string; expires_at?: number };
};

/** The lock a history entry created, or null when it isn't an allowed lock. */
export const lockFromEntry = ({ entry }: { entry: LogEntry }): HeldLock | null => {
  const body = entry.result.attempts[0]?.requestBody as LockRequestBody | undefined;
  const lockId = body?.lock?.lock_id;
  if (!lockId || outcomeOf({ result: entry.result }).text !== "Allowed") return null;
  return {
    lockId,
    amount: body.required_balance,
    expiresAt: body.lock?.expires_at,
    status: "held",
  };
};
