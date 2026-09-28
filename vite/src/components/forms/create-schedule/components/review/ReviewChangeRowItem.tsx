import { TABLE_TRAY_SURFACE_ROW_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import type { ReviewChangeRow } from "../../utils/review/types/reviewChange";
import { ReviewStatusChip } from "./ReviewStatusChip";

export const REVIEW_ROW_CLASS = cn(
	"flex min-h-11 items-center gap-3 px-3 py-[7px]",
	TABLE_TRAY_SURFACE_ROW_CLASS,
);

export const REVIEW_STATUS_COLUMN_CLASS = "w-[108px] shrink-0";

export const REVIEW_VALUE_COLUMN_CLASS =
	"flex min-w-[104px] shrink-0 justify-end";

/** Status sits in a fixed column and value in a minimum-width one, so chips line up and amounts never clip. */
export function ReviewChangeRowItem({
	row,
	showsStatus,
}: {
	row: ReviewChangeRow;
	showsStatus: boolean;
}) {
	return (
		<div className={REVIEW_ROW_CLASS}>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span
					className={cn(
						"truncate text-sm font-medium",
						row.status === "ends" ? "text-muted-foreground" : "text-foreground",
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
			{showsStatus && (
				<div className={REVIEW_STATUS_COLUMN_CLASS}>
					{row.status && <ReviewStatusChip status={row.status} />}
				</div>
			)}
			<span
				className={cn(
					REVIEW_VALUE_COLUMN_CLASS,
					"items-baseline gap-[3px] whitespace-nowrap",
				)}
			>
				{row.value && (
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
				)}
			</span>
		</div>
	);
}
