import type { Table as TanstackTable } from "@tanstack/react-table";
import {
	ChevronFirstIcon,
	ChevronLastIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const navBtnBase =
	"inline-flex items-center justify-center size-5 rounded text-t4 transition-colors hover:text-t2 disabled:pointer-events-none disabled:opacity-30";

export const TableFooter = <TData,>({
	table,
	pageSizeOptions = [5, 10, 25, 50],
	className,
	colSpan,
	leftSlot,
	rightSlot,
}: {
	table: TanstackTable<TData>;
	pageSizeOptions?: number[];
	className?: string;
	colSpan?: number;
	leftSlot?: ReactNode;
	rightSlot?: ReactNode;
}) => {
	const rowCount = table.getRowCount();
	const pageIndex = table.getState().pagination.pageIndex;
	const pageSize = table.getState().pagination.pageSize;
	const pageCount = Math.max(table.getPageCount(), 1);
	const start = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
	const end = Math.min((pageIndex + 1) * pageSize, rowCount);
	const resolvedColSpan = colSpan ?? table.getVisibleLeafColumns().length + 1;

	return (
		<tfoot className={cn("bg-card", className)}>
			<tr className="border-t text-t4">
				<td colSpan={resolvedColSpan} className="h-8 px-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3 text-tiny font-medium text-t4">
							<div className="flex items-center gap-1.5">
								<span>Rows</span>
								<select
									value={pageSize}
									onChange={(e) => table.setPageSize(Number(e.target.value))}
									className="h-5 cursor-pointer appearance-none rounded bg-transparent px-1 text-tiny font-medium text-t3 outline-none hover:text-t2"
								>
									{pageSizeOptions.map((opt) => (
										<option key={opt} value={opt}>
											{opt}
										</option>
									))}
								</select>
							</div>
							<span className="text-t4">
								{start}–{end} of {rowCount}
							</span>
							{leftSlot}
						</div>
						<div className="flex items-center gap-0.5">
							{rightSlot}
							<button
								type="button"
								aria-label="First page"
								className={navBtnBase}
								disabled={!table.getCanPreviousPage()}
								onClick={() => table.firstPage()}
							>
								<ChevronFirstIcon size={14} />
							</button>
							<button
								type="button"
								aria-label="Previous page"
								className={navBtnBase}
								disabled={!table.getCanPreviousPage()}
								onClick={() => table.previousPage()}
							>
								<ChevronLeftIcon size={14} />
							</button>
							<span className="min-w-10 text-center text-tiny font-medium text-t3">
								{pageIndex + 1} / {pageCount}
							</span>
							<button
								type="button"
								aria-label="Next page"
								className={navBtnBase}
								disabled={!table.getCanNextPage()}
								onClick={() => table.nextPage()}
							>
								<ChevronRightIcon size={14} />
							</button>
							<button
								type="button"
								aria-label="Last page"
								className={navBtnBase}
								disabled={!table.getCanNextPage()}
								onClick={() => table.lastPage()}
							>
								<ChevronLastIcon size={14} />
							</button>
						</div>
					</div>
				</td>
			</tr>
		</tfoot>
	);
};
