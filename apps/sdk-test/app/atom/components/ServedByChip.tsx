import { StatusChip } from "@autumn/ui";
import type { ServedBy } from "@/lib/atom/types";

const CHIPS: Record<ServedBy, { label: string; tone: "green" | "blue" | "amber" | "neutral" }> = {
  edge: { label: "Edge", tone: "green" },
  forwarded: { label: "Edge → API", tone: "blue" },
  fallback: { label: "API fallback", tone: "amber" },
  api: { label: "API", tone: "neutral" },
  none: { label: "No request", tone: "neutral" },
};

export const ServedByChip = ({ servedBy }: { servedBy: ServedBy }) => (
  <StatusChip tone={CHIPS[servedBy].tone} glyph="dashed">
    {CHIPS[servedBy].label}
  </StatusChip>
);
