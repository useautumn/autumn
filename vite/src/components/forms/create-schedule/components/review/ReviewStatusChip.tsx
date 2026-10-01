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
import type {
	ReviewChangeOrigin,
	ReviewChangeStatus,
} from "../../utils/review/types/reviewChange";

const REVIEW_STATUSES: Record<
	ReviewChangeStatus,
	{ label: string; tone: StatusTone; glyph: StatusGlyph }
> = {
	starts: { label: "Created", tone: "green", glyph: "check" },
	ends: { label: "Removed", tone: "red", glyph: "x" },
	kept: { label: "Unchanged", tone: "neutral", glyph: "check" },
	updated: { label: "Updated", tone: "blue", glyph: "pencil" },
	added: { label: "Added", tone: "green", glyph: "check" },
	removed: { label: "Removed", tone: "red", glyph: "minus" },
	reset: { label: "Resets", tone: "amber", glyph: "refresh" },
	carried: { label: "Carried over", tone: "blue", glyph: "check" },
	unmanaged: { label: "Not in Autumn", tone: "amber", glyph: "alert" },
};

type PlanStatus = Extract<
	ReviewChangeStatus,
	"starts" | "ends" | "kept" | "updated"
>;

/** Already-scheduled changes read muted; withdrawn ones say what no longer happens. */
const SCHEDULED_PLAN_STATUSES: Record<
	Exclude<ReviewChangeOrigin, "request">,
	Record<PlanStatus, { label: string; tone: StatusTone; glyph: StatusGlyph }>
> = {
	saved: {
		starts: { label: "Starts", tone: "neutral", glyph: "clock" },
		ends: { label: "Ends", tone: "neutral", glyph: "clock" },
		kept: { label: "Unchanged", tone: "neutral", glyph: "check" },
		updated: { label: "Updates", tone: "neutral", glyph: "clock" },
	},
	withdrawn: {
		starts: { label: "Won't start", tone: "amber", glyph: "x" },
		ends: { label: "No longer ends", tone: "amber", glyph: "minus" },
		kept: { label: "Unchanged", tone: "neutral", glyph: "check" },
		updated: { label: "Won't update", tone: "amber", glyph: "x" },
	},
};

const isPlanStatus = (status: ReviewChangeStatus): status is PlanStatus =>
	status === "starts" ||
	status === "ends" ||
	status === "kept" ||
	status === "updated";

const statusStyle = ({
	status,
	origin,
}: {
	status: ReviewChangeStatus;
	origin: ReviewChangeOrigin;
}) =>
	origin !== "request" && isPlanStatus(status)
		? SCHEDULED_PLAN_STATUSES[origin][status]
		: REVIEW_STATUSES[status];

export function ReviewStatusChip({
	status,
	origin = "request",
	changes = [],
}: {
	status: ReviewChangeStatus;
	origin?: ReviewChangeOrigin;
	changes?: ReviewChangeLine[];
}) {
	const { label, tone, glyph } = statusStyle({ status, origin });
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
