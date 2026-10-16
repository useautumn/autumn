import { StatusChip } from "@autumn/ui";
import type { Outcome } from "@/lib/atom/callAtom";

const STYLES = {
  good: { tone: "green", glyph: "check" },
  bad: { tone: "red", glyph: "x" },
  neutral: { tone: "neutral", glyph: "minus" },
} as const;

export const OutcomeChip = ({ outcome }: { outcome: Outcome }) => (
  <StatusChip {...STYLES[outcome.tone]}>{outcome.text}</StatusChip>
);
