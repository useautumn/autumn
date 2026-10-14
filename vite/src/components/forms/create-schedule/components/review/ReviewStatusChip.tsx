import type {
	SetPlansReviewChangeLine,
	SetPlansReviewRow,
} from "@autumn/shared";
import {
	StatusChip,
	StatusChipIcon,
	type StatusGlyph,
	type StatusTone,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { cn } from "@/lib/utils";
import { formatReviewText } from "../../utils/review/formatReviewText";
import { REVIEW_RICH_TOOLTIP_CLASS } from "./reviewRichTooltip";

type ReviewChangeStatus = NonNullable<SetPlansReviewRow["status"]>;
type ReviewChangeLineState = SetPlansReviewChangeLine["state"];

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
};

export function ReviewStatusChip({
	status,
	changes = [],
}: {
	status: ReviewChangeStatus;
	changes?: SetPlansReviewChangeLine[];
}) {
	const { label, tone, glyph } = REVIEW_STATUSES[status];
	const hasTooltip = changes.length > 0;
	const chip = (
		<StatusChip
			tone={tone}
			glyph={glyph}
			title={hasTooltip ? undefined : label}
		>
			{label}
		</StatusChip>
	);
	if (!hasTooltip) return chip;

	return (
		<Tooltip>
			<TooltipTrigger asChild>{chip}</TooltipTrigger>
			<TooltipContent
				side="top"
				className={cn("flex flex-col gap-1", REVIEW_RICH_TOOLTIP_CLASS)}
			>
				{changes.map((change, index) => (
					<ReviewChangeLineRow
						key={`${index}-${change.label}`}
						change={change}
					/>
				))}
			</TooltipContent>
		</Tooltip>
	);
}

const CHANGE_LINE_ICONS: Record<
	ReviewChangeLineState,
	{ tone: StatusTone; glyph: StatusGlyph }
> = {
	new: { tone: "green", glyph: "check" },
	updated: { tone: "blue", glyph: "pencil" },
	removed: { tone: "red", glyph: "x" },
};

/** Old values sit muted beside the foreground new value; a removed feature is struck through. */
function ReviewChangeLineRow({ change }: { change: SetPlansReviewChangeLine }) {
	const isRemoved = change.state === "removed";
	return (
		<span className="flex min-w-56 items-center gap-2">
			<StatusChipIcon {...CHANGE_LINE_ICONS[change.state]} />
			<span
				className={cn(
					"flex-1 text-muted-foreground",
					isRemoved && "text-tertiary-foreground line-through",
				)}
			>
				{change.label}
			</span>
			<span className="flex items-baseline gap-1.5 tabular-nums">
				{change.before && (
					<>
						<span className="text-tertiary-foreground">
							{formatReviewText(change.before)}
						</span>
						<span className="text-tertiary-foreground/70">→</span>
					</>
				)}
				{change.after && (
					<span
						className={cn(
							isRemoved
								? "text-muted-foreground"
								: "font-medium text-foreground",
						)}
					>
						{formatReviewText(change.after)}
					</span>
				)}
			</span>
		</span>
	);
}
