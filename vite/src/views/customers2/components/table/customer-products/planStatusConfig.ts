import type { StatusGlyph, StatusTone } from "@autumn/ui";
import type { PlanStatus } from "./resolvePlanStatus";

export const PLAN_STATUS_CONFIG: Record<
	PlanStatus,
	{ label: string; tone: StatusTone; glyph: StatusGlyph }
> = {
	active: { label: "Active", tone: "green", glyph: "check" },
	trialing: { label: "Trial", tone: "blue", glyph: "clock" },
	canceling: { label: "Cancelling", tone: "orange", glyph: "minus" },
	past_due: { label: "Past due", tone: "red", glyph: "alert" },
	scheduled: { label: "Scheduled", tone: "purple", glyph: "calendar" },
	paused: { label: "Paused", tone: "yellow", glyph: "pause" },
	expired: { label: "Expired", tone: "neutral", glyph: "x" },
	pending: { label: "Pending", tone: "neutral", glyph: "hourglass" },
};
