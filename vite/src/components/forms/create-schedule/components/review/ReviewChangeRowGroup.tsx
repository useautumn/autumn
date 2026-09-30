import { CaretRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import type { ReviewChangeRow } from "../../utils/review/types/reviewChange";
import { ReviewChangeRowTrailing } from "./ReviewChangeRowItem";

const itemCountLabel = (count: number) =>
	count === 1 ? "1 item" : `${count} items`;

/** A plan row that expands into the items it bills, indented under the plan name. */
export function ReviewChangeRowGroup({
	row,
	items,
	showsStatus,
}: {
	row: ReviewChangeRow;
	items: ReviewChangeRow[];
	showsStatus: boolean;
}) {
	const [isExpanded, setIsExpanded] = useState(items.length > 1);
	const showsItemCount = isExpanded || !row.value;

	return (
		<div className={cn("flex flex-col", TABLE_TRAY_SURFACE_DIVIDER_CLASS)}>
			<button
				type="button"
				aria-expanded={isExpanded}
				onClick={() => setIsExpanded((expanded) => !expanded)}
				className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 py-[7px] text-left hover:bg-table-row-hover"
			>
				<span className="flex min-w-0 flex-1 items-center gap-2">
					<CaretRightIcon
						size={14}
						weight="bold"
						className={cn(
							"shrink-0 text-tertiary-foreground transition-transform duration-200",
							isExpanded && "rotate-90",
						)}
					/>
					<span className="truncate text-sm font-medium text-foreground">
						{row.title}
					</span>
				</span>
				<ReviewChangeRowTrailing
					row={row}
					showsStatus={showsStatus}
					valueOverride={
						showsItemCount ? (
							<span className="text-xs text-tertiary-foreground">
								{itemCountLabel(items.length)}
							</span>
						) : undefined
					}
				/>
			</button>
			{isExpanded && (
				<div className="flex flex-col">
					{items.map((item) => (
						<div
							key={item.key}
							className="flex min-h-9 items-center gap-3 border-t border-table-row-divider pr-3 pl-[34px]"
						>
							<span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
								{item.title}
							</span>
							<ReviewChangeRowTrailing row={item} showsStatus={showsStatus} />
						</div>
					))}
				</div>
			)}
		</div>
	);
}
