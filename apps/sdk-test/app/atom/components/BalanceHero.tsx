import { Button, Card, cn } from "@autumn/ui";
import type { BalanceSnapshot } from "@/lib/atom/fetchBalanceSnapshot";
import { formatNumber } from "../format";
import type { LogEntry } from "../types";
import { DeltaText } from "./DeltaText";
import { LastResult } from "./LastResult";
import { ServedByChip } from "./ServedByChip";

export const BalanceHero = ({
  balance,
  refreshing,
  onRefresh,
  last,
}: {
  balance: BalanceSnapshot | undefined;
  refreshing: boolean;
  onRefresh: () => void;
  last: LogEntry | undefined;
}) => {
  const edge = balance?.edge;
  const api = balance?.api;
  const drift =
    typeof edge?.net === "number" && typeof api?.net === "number" ? edge.net - api.net : null;
  const usedPercent =
    edge?.granted && edge.usage !== null
      ? Math.min(100, Math.max(0, (edge.usage / edge.granted) * 100))
      : 0;
  const overage = edge?.net !== null && edge?.net !== undefined && edge.net < 0 ? -edge.net : 0;

  return (
    <Card className="gap-0 py-0 shadow-md">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
              <span
                className={cn(
                  "text-3xl font-semibold tracking-tight text-foreground",
                  overage > 0 && "text-[#E5484D]",
                )}
              >
                {edge?.unlimited ? "∞" : formatNumber(edge?.net)}
              </span>
              <span className="text-sm text-tertiary-foreground">
                / {formatNumber(edge?.granted)}
              </span>
              {overage > 0 && (
                <span className="ml-1 text-xs text-[#E5484D]">
                  {formatNumber(overage)} overage
                </span>
              )}
            </div>
            {balance?.edgeError && (
              <p className="text-xs text-[#E5484D]">{balance.edgeError}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {balance && <ServedByChip servedBy={balance.edgeServedBy} />}
            <Button variant="secondary" size="sm" isLoading={refreshing} onClick={onRefresh}>
              ↻
            </Button>
          </div>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full bg-primary", overage > 0 && "bg-[#E5484D]")}
            style={{ width: `${usedPercent}%` }}
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-tertiary-foreground">
          <span>API</span>
          <span className="font-mono tabular-nums text-foreground">
            {formatNumber(api?.net)}
          </span>
          {drift === 0 && <span>· in sync</span>}
          {drift !== null && drift !== 0 && (
            <span className="text-[#E5A21F]">
              · drift <DeltaText delta={drift} className="text-[#E5A21F]" />
            </span>
          )}
        </div>
      </div>
      <div className="border-t border-border px-4 py-2.5">
        <LastResult entry={last} />
      </div>
    </Card>
  );
};
