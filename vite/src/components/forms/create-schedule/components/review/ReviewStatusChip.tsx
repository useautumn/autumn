import {
	StatusChip,
	type StatusGlyph,
	type StatusTone,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { ChangeDot } from "@/components/v2/ItemStatusDot";
import type { ReviewChangeLine } from "../../utils/review/planChangeLines";
import type { ReviewChangeStatus } from "../../utils/review/types/reviewChange";

const REVIEW_STATUSES: Record<
	ReviewChangeStatus,
	{ label: string; tone: StatusTone; glyph: StatusGlyph }
> = {
	starts: { label: "Created", tone: "green", glyph: "check" },
	ends: { label: "Removed", tone: "red", glyph: "x" },
	kept: { label: "Kept", tone: "neutral", glyph: "check" },
	updated: { label: "Updated", tone: "blue", glyph: "pencil" },
	added: { label: "Added", tone: "green", glyph: "check" },
	removed: { label: "Removed", tone: "red", glyph: "minus" },
	reset: { label: "Resets", tone: "amber", glyph: "refresh" },
	carried: { label: "Carried over", tone: "blue", glyph: "check" },
	unmanaged: { label: "Not in Autumn", tone: "amber", glyph: "alert" },
};

export function ReviewStatusChip({
	status,
	changes = [],
}: {
	status: ReviewChangeStatus;
	changes?: ReviewChangeLine[];
}) {
	const { label, tone, glyph } = REVIEW_STATUSES[status];
	const chip = (
		<StatusChip tone={tone} glyph={glyph}>
			{changes.length > 1 ? `${label} · ${changes.length}` : label}
		</StatusChip>
	);
	if (changes.length === 0) return chip;

	return (
		<Tooltip>
			<TooltipTrigger asChild>{chip}</TooltipTrigger>
			<TooltipContent side="top" className="flex flex-col gap-px">
				{changes.map((change) => (
					<span key={change.text} className="flex items-center gap-2">
						<ChangeDot state={change.state} />
						{change.text}
					</span>
				))}
			</TooltipContent>
		</Tooltip>
	);
}
