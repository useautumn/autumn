import {
	CursorPagination,
	PageSizeSelector,
} from "@autumn/ui/components/table/cursor-pagination";
import { cn } from "@autumn/ui/lib/utils";

export function TablePaginationFooter({
	currentPage,
	totalPages,
	totalCount,
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
	return (
		<div
			className={cn("flex items-center justify-between gap-2 pt-4", className)}
		>
			<div className="flex items-center gap-2 text-xs text-tertiary-foreground">
				<span>Rows</span>
				<PageSizeSelector
					pageSize={pageSize}
					options={pageSizeOptions}
					onChange={onPageSizeChange}
					disabled={disabled}
				/>
				{typeof totalCount === "number" && (
					<span className="tabular-nums">{totalCount} total</span>
				)}
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
	);
}
