import {
	PLAN_STATUS_CONFIG,
	type StatusChipConfig,
} from "@/components/forms/customer-state/utils/planStatusConfig";
import type { ReviewChangeStatus } from "../../utils/review/types/reviewChange";

export const REVIEW_STATUS_CONFIG: Record<
	ReviewChangeStatus,
	StatusChipConfig
> = {
	starts: PLAN_STATUS_CONFIG.starts,
	ends: PLAN_STATUS_CONFIG.ends,
	kept: PLAN_STATUS_CONFIG.kept,
	updated: { label: "Updated", tone: "blue", glyph: "pencil" },
	added: { label: "Added", tone: "green", glyph: "check" },
	removed: { label: "Removed", tone: "red", glyph: "minus" },
	reset: { label: "Resets", tone: "amber", glyph: "refresh" },
	carried: { label: "Carried over", tone: "blue", glyph: "check" },
	unmanaged: { label: "Not in Autumn", tone: "amber", glyph: "alert" },
};
