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
import type {
	ReviewChangeLine,
	ReviewChangeLineState,
} from "../../utils/review/planChangeLines";
import type { ReviewChangeStatus } from "../../utils/review/types/reviewChange";
import { REVIEW_RICH_TOOLTIP_CLASS } from "./reviewRichTooltip";

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
			<TooltipContent
				side="top"
				className={cn("flex flex-col gap-1", REVIEW_RICH_TOOLTIP_CLASS)}
			>
				{changes.map((change) => (
					<ReviewChangeLineRow key={change.label} change={change} />
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
function ReviewChangeLineRow({ change }: { change: ReviewChangeLine }) {
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
						<span className="text-tertiary-foreground">{change.before}</span>
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
						{change.after}
					</span>
				)}
			</span>
		</span>
	);
}
