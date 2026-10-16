import type { AtomCallResult } from "@/lib/atom/types";

export type LogEntry = {
  id: number;
  at: number;
  label: string;
  result: AtomCallResult;
  before: number | null;
  after: number | null;
};

export type HeldLock = {
  lockId: string;
  amount: number | undefined;
  expiresAt?: number;
  status: "held" | "confirmed" | "released" | "failed";
};

export type FinalizeLock = (args: {
  lock: HeldLock;
  action: "confirm" | "release";
  overrideValue?: number;
}) => Promise<void>;
