import { StatusChip } from "@autumn/ui";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import type { ReviewChangeRow } from "../../utils/review/types/reviewChange";
import { ReviewStatusChip } from "./ReviewStatusChip";

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

/** Trial, status and value columns, shared by plain and grouped rows so they align. */
export function ReviewChangeRowTrailing({
	row,
	showsStatus,
	valueOverride,
}: {
	row: ReviewChangeRow;
	showsStatus: boolean;
	valueOverride?: ReactNode;
}) {
	return (
		<>
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
			<span className="flex min-w-[104px] shrink-0 items-baseline justify-end gap-[3px] whitespace-nowrap">
				{valueOverride ??
					(row.value && (
						<>
							<span className="text-sm font-medium tabular-nums text-foreground">
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
