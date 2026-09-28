import type { StatusGlyph, StatusTone } from "@autumn/ui";
import type { ReviewChangeStatus } from "../../utils/review/types/reviewChange";

export const REVIEW_STATUS_CONFIG: Record<
	ReviewChangeStatus,
	{ label: string; tone: StatusTone; glyph: StatusGlyph }
> = {
	starts: { label: "Starts", tone: "green", glyph: "check" },
	ends: { label: "Ends", tone: "red", glyph: "x" },
	kept: { label: "Kept", tone: "neutral", glyph: "check" },
	updated: { label: "Updated", tone: "blue", glyph: "pencil" },
	added: { label: "Added", tone: "green", glyph: "check" },
	removed: { label: "Removed", tone: "red", glyph: "minus" },
	reset: { label: "Resets", tone: "amber", glyph: "refresh" },
	carried: { label: "Carried over", tone: "blue", glyph: "check" },
	unmanaged: { label: "Not in Autumn", tone: "amber", glyph: "alert" },
};
