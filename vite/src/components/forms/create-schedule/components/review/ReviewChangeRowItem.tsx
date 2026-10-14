import { numberWithCommas, type SetPlansReviewRow } from "@autumn/shared";
import {
	StatusChip,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { format } from "date-fns";
import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import { formatReviewText } from "../../utils/review/formatReviewText";
import { isRemovedReviewRow } from "../../utils/review/isRemovedReviewRow";
import { ReviewStatusChip } from "./ReviewStatusChip";
import { useReviewValueColumnWidth } from "./ReviewValueColumnContext";
import { REVIEW_RICH_TOOLTIP_CLASS } from "./reviewRichTooltip";

/** Status sits in a fixed column and value in a minimum-width one, so chips line up and amounts never clip. */
export function ReviewChangeRowItem({
	row,
	showsStatus,
}: {
	row: SetPlansReviewRow;
	showsStatus: boolean;
}) {
	return (
		<div
			className={cn(
				"flex min-h-11 items-center gap-3 px-3 py-[7px]",
				TABLE_TRAY_SURFACE_DIVIDER_CLASS,
				isRemovedReviewRow(row) && "opacity-80",
			)}
		>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span
					className={cn(
						"truncate text-sm font-medium",
						isRemovedReviewRow(row)
							? "text-muted-foreground"
							: "text-foreground",
					)}
				>
					{row.title}
				</span>
				{row.description && (
					<span className="truncate text-xs text-tertiary-foreground">
						{formatReviewText(row.description)}
					</span>
				)}
			</div>
			<ReviewChangeRowTrailing row={row} showsStatus={showsStatus} />
		</div>
	);
}

type ReviewPooledBalance = NonNullable<SetPlansReviewRow["pooled"]>;

const poolTotalLabel = ({ previous_total, total }: ReviewPooledBalance) =>
	previous_total === null || previous_total === total
		? numberWithCommas(total)
		: `${numberWithCommas(previous_total)} → ${numberWithCommas(total)}`;

function PooledChip({
	featureName,
	pooled,
}: {
	featureName: string;
	pooled: ReviewPooledBalance;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<StatusChip
					tone="fuchsia"
					glyph="coins"
					className="shrink-0"
					title={undefined}
				>
					Pooled
				</StatusChip>
			</TooltipTrigger>
			<TooltipContent side="top" className={REVIEW_RICH_TOOLTIP_CLASS}>
				<div className="flex w-[250px] flex-col gap-0.5">
					<span className="font-medium text-foreground">{`Shared ${featureName} pool`}</span>
					<div className="flex justify-between gap-3 text-tertiary-foreground">
						<span>Pool total</span>
						<span className="tabular-nums">{poolTotalLabel(pooled)}</span>
					</div>
					<div className="flex justify-between gap-3 text-tertiary-foreground">
						<span>Contributing entities</span>
						<span className="tabular-nums">{pooled.contributors}</span>
					</div>
				</div>
			</TooltipContent>
		</Tooltip>
	);
}

function OngoingChip() {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<StatusChip
					tone="purple"
					glyph="play"
					className="shrink-0"
					title={undefined}
				>
					Ongoing
				</StatusChip>
			</TooltipTrigger>
			<TooltipContent side="top">
				Kept across every phase; later schedule changes won't remove it
			</TooltipContent>
		</Tooltip>
	);
}

/** Trial, status and value columns, in fixed widths so rows align. */
function ReviewChangeRowTrailing({
	row,
	showsStatus,
}: {
	row: SetPlansReviewRow;
	showsStatus: boolean;
}) {
	const valueColumnWidth = useReviewValueColumnWidth();
	return (
		<>
			{row.ongoing && <OngoingChip />}
			{row.pooled && <PooledChip featureName={row.title} pooled={row.pooled} />}
			{row.trial_ends_at !== undefined && (
				<StatusChip tone="blue" glyph="clock" className="shrink-0">
					{`Trial · ends ${format(row.trial_ends_at, "MMM d")}`}
				</StatusChip>
			)}
			{showsStatus && (
				<div className="w-[108px] shrink-0">
					{row.status && (
						<ReviewStatusChip status={row.status} changes={row.changes} />
					)}
				</div>
			)}
			<span
				className="flex min-w-[104px] shrink-0 items-baseline justify-end gap-[3px] whitespace-nowrap"
				style={valueColumnWidth ? { width: valueColumnWidth } : undefined}
			>
				{row.value && (
					<>
						<span
							className={cn(
								"text-sm tabular-nums",
								row.value.is_basis
									? "text-tertiary-foreground"
									: "font-medium text-foreground",
							)}
						>
							{row.value.amount}
						</span>
						{row.value.suffix && (
							<span className="text-xs text-tertiary-foreground">
								{row.value.suffix}
							</span>
						)}
					</>
				)}
			</span>
		</>
	);
}
