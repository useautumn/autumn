import type { StatusGlyph, StatusTone } from "@autumn/ui";
import type { PhasePlanStatus } from "./phasePlanStatus";

export type StatusChipConfig = {
	label: string;
	tone: StatusTone;
	glyph: StatusGlyph;
};

export type PlanStatus = PhasePlanStatus | "ends" | "ongoing";

export const PLAN_STATUS_CONFIG: Record<PlanStatus, StatusChipConfig> = {
	starts: { label: "Starts", tone: "green", glyph: "check" },
	kept: { label: "Kept", tone: "neutral", glyph: "check" },
	ends: { label: "Ends", tone: "red", glyph: "x" },
	ongoing: { label: "Ongoing", tone: "purple", glyph: "play" },
};
