import { CursorPagination } from "@/components/general/table";

/** Compact "start–end of total" pager for sheet lists; pageIndex is zero-based. */
export function SheetPaginationControls({
	rangeStart,
	rangeEnd,
	total,
	pageIndex,
	pageCount,
	onPrev,
	onNext,
}: {
	rangeStart: number;
	rangeEnd: number;
	total: number;
	pageIndex: number;
	pageCount: number;
	onPrev: () => void;
	onNext: () => void;
}) {
	return (
		<div className="flex items-center justify-between pt-3">
			<span className="text-xs text-tertiary-foreground tabular-nums">
				{rangeStart}–{rangeEnd} of {total}
			</span>
			<CursorPagination
				currentPage={pageIndex + 1}
				totalPages={pageCount}
				canGoPrev={pageIndex > 0}
				canGoNext={pageIndex < pageCount - 1}
				onPrev={onPrev}
				onNext={onNext}
			/>
		</div>
	);
}
