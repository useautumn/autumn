import { numberWithCommas } from "@autumn/shared";
import {
	StatusChip,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import type {
	ReviewChangeRow,
	ReviewPooledBalance,
} from "../../utils/review/types/reviewChange";
import { ReviewStatusChip } from "./ReviewStatusChip";
import { useReviewValueColumnWidth } from "./ReviewValueColumnContext";
import { REVIEW_RICH_TOOLTIP_CLASS } from "./reviewRichTooltip";

/** Status sits in a fixed column and value in a minimum-width one, so chips line up and amounts never clip. */
export function ReviewChangeRowItem({
	row,
	showsStatus,
}: {
	row: ReviewChangeRow;
	showsStatus: boolean;
}) {
	return (
		<div
			className={cn(
				"flex min-h-11 items-center gap-3 px-3 py-[7px]",
				TABLE_TRAY_SURFACE_DIVIDER_CLASS,
			)}
		>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span
					className={cn(
						"truncate text-sm font-medium",
						row.status === "ends" || row.status === "removed"
							? "text-muted-foreground"
							: "text-foreground",
					)}
				>
					{row.title}
				</span>
				{row.description && (
					<span className="truncate text-xs text-tertiary-foreground">
						{row.description}
					</span>
				)}
			</div>
			<ReviewChangeRowTrailing row={row} showsStatus={showsStatus} />
		</div>
	);
}

const poolTotalLabel = ({ previousTotal, total }: ReviewPooledBalance) =>
	previousTotal === null || previousTotal === total
		? numberWithCommas(total)
		: `${numberWithCommas(previousTotal)} → ${numberWithCommas(total)}`;

function PooledChip({ pooled }: { pooled: ReviewPooledBalance }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<StatusChip tone="fuchsia" glyph="coins" className="shrink-0">
					Pooled
				</StatusChip>
			</TooltipTrigger>
			<TooltipContent side="top" className={REVIEW_RICH_TOOLTIP_CLASS}>
				<div className="flex w-[250px] flex-col gap-0.5">
					<span className="font-medium text-foreground">{`Shared ${pooled.featureName} pool`}</span>
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
				<StatusChip tone="purple" glyph="play" className="shrink-0">
					Ongoing
				</StatusChip>
			</TooltipTrigger>
			<TooltipContent side="top">
				Kept across every phase; later schedule changes won't remove it
			</TooltipContent>
		</Tooltip>
	);
}

/** Trial, status and value columns, shared by plain and grouped rows so they align. */
export function ReviewChangeRowTrailing({
	row,
	showsStatus,
	valueOverride,
	isNested = false,
}: {
	row: ReviewChangeRow;
	showsStatus: boolean;
	valueOverride?: ReactNode;
	isNested?: boolean;
}) {
	const valueColumnWidth = useReviewValueColumnWidth();
	return (
		<>
			{row.ongoing && <OngoingChip />}
			{row.pooled && <PooledChip pooled={row.pooled} />}
			{row.trialEndsAt !== undefined && (
				<StatusChip tone="blue" glyph="clock" className="shrink-0">
					{`Trial · ends ${format(row.trialEndsAt, "MMM d")}`}
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
				{valueOverride ??
					(row.value && (
						<>
							<span
								className={cn(
									"text-sm tabular-nums",
									row.value.isBasis
										? "text-tertiary-foreground"
										: "text-foreground",
									!(isNested || row.value.isBasis) && "font-medium",
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
					))}
			</span>
		</>
	);
}
