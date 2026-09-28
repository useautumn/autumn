import { TABLE_TRAY_SURFACE_ROW_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import type { ReviewChangeRow } from "../../utils/review/types/reviewChange";
import { ReviewStatusChip } from "./ReviewStatusChip";

export function ReviewChangeRowItem({ row }: { row: ReviewChangeRow }) {
	return (
		<div
			className={cn(
				"flex min-h-11 items-center gap-3 px-3 py-[7px]",
				TABLE_TRAY_SURFACE_ROW_CLASS,
			)}
		>
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
			{row.status && (
				<div className="w-[108px] shrink-0">
					<ReviewStatusChip status={row.status} />
				</div>
			)}
			{row.value && (
				<span className="flex w-[104px] shrink-0 items-baseline justify-end gap-[3px] whitespace-nowrap">
					<span className="text-sm font-medium tabular-nums text-foreground">
						{row.value.amount}
					</span>
					{row.value.suffix && (
						<span className="text-xs text-tertiary-foreground">
							{row.value.suffix}
						</span>
					)}
				</span>
			)}
		</div>
	);
}
