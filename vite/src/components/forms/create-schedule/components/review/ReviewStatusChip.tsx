import { StatusChip, type StatusGlyph, type StatusTone } from "@autumn/ui";
import type { ReviewChangeStatus } from "../../utils/review/types/reviewChange";

const REVIEW_STATUSES: Record<
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

export function ReviewStatusChip({ status }: { status: ReviewChangeStatus }) {
	const { label, tone, glyph } = REVIEW_STATUSES[status];
	return (
		<StatusChip tone={tone} glyph={glyph}>
			{label}
		</StatusChip>
	);
}
