import { Button, cn, Input, StatusChip } from "@autumn/ui";
import { useState } from "react";
import { formatNumber, numberOrUndefined } from "../format";
import type { FinalizeLock, HeldLock } from "../types";

const STATUS = {
  held: { tone: "blue", glyph: "clock" },
  confirmed: { tone: "green", glyph: "check" },
  released: { tone: "neutral", glyph: "minus" },
  failed: { tone: "red", glyph: "x" },
} as const;

export const LockRow = ({ lock, onFinalize }: { lock: HeldLock; onFinalize: FinalizeLock }) => {
  const [override, setOverride] = useState("");
  const [busy, setBusy] = useState<"confirm" | "release" | null>(null);

  const finalize = async (action: "confirm" | "release") => {
    setBusy(action);
    const overrideValue = action === "confirm" ? numberOrUndefined(override) : undefined;
    await onFinalize({ lock, action, overrideValue }).finally(() => setBusy(null));
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2",
        lock.status !== "held" && "opacity-50",
      )}
    >
      <StatusChip {...STATUS[lock.status]}>{lock.status}</StatusChip>
      <span className="font-mono text-sm tabular-nums text-foreground">
        {formatNumber(lock.amount ?? 1)}
      </span>
      <span className="truncate font-mono text-[11px] text-tertiary-foreground">
        {lock.lockId}
      </span>
      <Input
        aria-label="Override value"
        className="ml-auto h-7 w-20 font-mono"
        placeholder="value"
        inputMode="decimal"
        value={override}
        onChange={(e) => setOverride(e.target.value)}
      />
      <Button size="sm" isLoading={busy === "confirm"} onClick={() => finalize("confirm")}>
        Confirm
      </Button>
      <Button
        size="sm"
        variant="secondary"
        isLoading={busy === "release"}
        onClick={() => finalize("release")}
      >
        Release
      </Button>
    </div>
  );
};
