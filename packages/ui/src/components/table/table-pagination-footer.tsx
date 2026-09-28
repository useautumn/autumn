import {
	CursorPagination,
	PageSizeSelector,
} from "@autumn/ui/components/table/cursor-pagination";
import { TABLE_TRAY_FOOTER_CLASS } from "@autumn/ui/components/table/table-tray-classes";
import { cn } from "@autumn/ui/lib/utils";

const numberFormat = new Intl.NumberFormat("en-US");

export function TablePaginationFooter({
	currentPage,
	totalPages,
	totalCount,
	isTotalCountApproximate = false,
	canGoPrev,
	canGoNext,
	onPrev,
	onNext,
	pageSize,
	pageSizeOptions,
	onPageSizeChange,
	disabled = false,
	enableHotkeys = false,
	className,
}: {
	currentPage: number;
	totalPages: number | null;
	totalCount?: number;
	isTotalCountApproximate?: boolean;
	canGoPrev: boolean;
	canGoNext: boolean;
	onPrev: () => void;
	onNext: () => void;
	pageSize: number;
	pageSizeOptions: readonly number[];
	onPageSizeChange: (size: number) => void;
	disabled?: boolean;
	enableHotkeys?: boolean;
	className?: string;
}) {
	const hasTotal = typeof totalCount === "number";
	const firstRowNumber = (currentPage - 1) * pageSize + 1;
	const lastRowNumber = hasTotal
		? Math.min(currentPage * pageSize, totalCount)
		: currentPage * pageSize;

	return (
		<div className={cn(TABLE_TRAY_FOOTER_CLASS, className)}>
			<span className="text-xs text-tertiary-foreground tabular-nums">
				{hasTotal &&
					`Showing ${numberFormat.format(firstRowNumber)}–${numberFormat.format(lastRowNumber)} of ${isTotalCountApproximate ? "~" : ""}${numberFormat.format(totalCount)}`}
			</span>
			<div className="flex items-center gap-3">
				<div className="flex items-center gap-1.5 text-xs text-tertiary-foreground">
					<span>Rows</span>
					<PageSizeSelector
						pageSize={pageSize}
						options={pageSizeOptions}
						onChange={onPageSizeChange}
						disabled={disabled}
					/>
				</div>
				<CursorPagination
					currentPage={currentPage}
					totalPages={totalPages}
					canGoPrev={canGoPrev}
					canGoNext={canGoNext}
					onPrev={onPrev}
					onNext={onNext}
					disabled={disabled}
					enableHotkeys={enableHotkeys}
				/>
			</div>
		</div>
	);
}
