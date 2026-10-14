import { numberWithCommas, type SetPlansReviewRow } from "@autumn/shared";
import {
	StatusChip,
	type StatusGlyph,
	type StatusTone,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatReviewText } from "../../utils/review/formatReviewText";
import { isRemovedReviewRow } from "../../utils/review/isRemovedReviewRow";
import { ReviewStatusChip } from "./ReviewStatusChip";
import { ReviewValue } from "./ReviewValue";
import { useReviewValueColumnWidth } from "./ReviewValueColumnContext";
import {
	REVIEW_ROW_CLASS,
	REVIEW_STATUS_COLUMN_CLASS,
	REVIEW_VALUE_COLUMN_CLASS,
} from "./reviewColumns";
import { REVIEW_RICH_TOOLTIP_CLASS } from "./reviewRichTooltip";

type ReviewPooledBalance = NonNullable<SetPlansReviewRow["pooled"]>;

const poolTotalLabel = ({ previous_total, total }: ReviewPooledBalance) =>
	previous_total === null || previous_total === total
		? numberWithCommas(total)
		: `${numberWithCommas(previous_total)} → ${numberWithCommas(total)}`;

/** A chip that explains itself on hover. */
function ReviewTooltipChip({
	tone,
	glyph,
	label,
	tooltip,
	tooltipClassName,
}: {
	tone: StatusTone;
	glyph: StatusGlyph;
	label: string;
	tooltip: ReactNode;
	tooltipClassName?: string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<StatusChip
					tone={tone}
					glyph={glyph}
					className="shrink-0"
					title={undefined}
				>
					{label}
				</StatusChip>
			</TooltipTrigger>
			<TooltipContent side="top" className={tooltipClassName}>
				{tooltip}
			</TooltipContent>
		</Tooltip>
	);
}

function PooledTooltip({
	featureName,
	pooled,
}: {
	featureName: string;
	pooled: ReviewPooledBalance;
}) {
	return (
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
	);
}

/** Status sits in a fixed column and value in a minimum-width one, so chips line up and amounts never clip. */
export function ReviewChangeRowItem({
	row,
	showsStatus,
}: {
	row: SetPlansReviewRow;
	showsStatus: boolean;
}) {
	const valueColumnWidth = useReviewValueColumnWidth();
	const isRemoved = isRemovedReviewRow(row);

	return (
		<div className={cn(REVIEW_ROW_CLASS, isRemoved && "opacity-80")}>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span
					className={cn(
						"truncate text-sm font-medium",
						isRemoved ? "text-muted-foreground" : "text-foreground",
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
			{row.ongoing && (
				<ReviewTooltipChip
					tone="purple"
					glyph="play"
					label="Ongoing"
					tooltip="Kept across every phase; later schedule changes won't remove it"
				/>
			)}
			{row.pooled && (
				<ReviewTooltipChip
					tone="fuchsia"
					glyph="coins"
					label="Pooled"
					tooltip={
						<PooledTooltip featureName={row.title} pooled={row.pooled} />
					}
					tooltipClassName={REVIEW_RICH_TOOLTIP_CLASS}
				/>
			)}
			{row.trial_ends_at !== undefined && (
				<StatusChip tone="blue" glyph="clock" className="shrink-0">
					{`Trial · ends ${format(row.trial_ends_at, "MMM d")}`}
				</StatusChip>
			)}
			{showsStatus && (
				<div className={REVIEW_STATUS_COLUMN_CLASS}>
					{row.status && (
						<ReviewStatusChip status={row.status} changes={row.changes} />
					)}
				</div>
			)}
			<span
				className={cn(
					REVIEW_VALUE_COLUMN_CLASS,
					"items-baseline justify-end gap-[3px] whitespace-nowrap",
				)}
				style={valueColumnWidth ? { width: valueColumnWidth } : undefined}
			>
				{row.value && <ReviewValue value={row.value} />}
			</span>
		</div>
	);
}
