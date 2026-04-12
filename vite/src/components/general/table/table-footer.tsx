import type { Table as TanstackTable } from "@tanstack/react-table";
import {
	ChevronFirstIcon,
	ChevronLastIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/v2/buttons/Button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { Separator } from "@/components/v2/separator";
import { cn } from "@/lib/utils";

const paginationButtonClassName =
	"disabled:pointer-events-none disabled:opacity-50 rounded-none border-none";

export const TableFooter = <TData,>({
	table,
	pageSizeOptions = [5, 10, 25, 50],
	className,
	leftSlot,
	centerSlot,
	rightSlot,
}: {
	table: TanstackTable<TData>;
	pageSizeOptions?: number[];
	className?: string;
	leftSlot?: ReactNode;
	centerSlot?: ReactNode;
	rightSlot?: ReactNode;
}) => {
	const rowCount = table.getRowCount();
	const pageIndex = table.getState().pagination.pageIndex;
	const pageSize = table.getState().pagination.pageSize;
	const pageCount = Math.max(table.getPageCount(), 1);
	const start = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
	const end = Math.min((pageIndex + 1) * pageSize, rowCount);

	return (
		<div
			className={cn(
				"flex flex-col gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-card sm:flex-row sm:items-center sm:justify-between",
				className,
			)}
		>
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span className="text-xs text-muted-foreground">Rows per page</span>
					<Select
						onValueChange={(value) => table.setPageSize(Number(value))}
						value={pageSize.toString()}
					>
						<SelectTrigger className="h-7 w-fit rounded-lg px-2 text-xs">
							<SelectValue placeholder="Rows" />
						</SelectTrigger>
						<SelectContent>
							{pageSizeOptions.map((option) => (
								<SelectItem key={option} value={option.toString()}>
									{option}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="text-sm text-muted-foreground">
					Showing {start}-{end} of {rowCount}
				</div>
				{leftSlot}
			</div>
			{centerSlot && (
				<div className="flex items-center justify-center">{centerSlot}</div>
			)}
			<div className="flex items-center justify-between gap-3 sm:justify-end">
				{rightSlot}
				<div className="inline-flex items-center overflow-hidden rounded-lg border border-border bg-background">
					<Button
						aria-label="Go to first page"
						className={paginationButtonClassName}
						disabled={!table.getCanPreviousPage()}
						onClick={() => table.firstPage()}
						size="icon"
						variant="secondary"
					>
						<ChevronFirstIcon size={16} />
					</Button>
					<Separator orientation="vertical" />
					<Button
						aria-label="Go to previous page"
						className={paginationButtonClassName}
						disabled={!table.getCanPreviousPage()}
						onClick={() => table.previousPage()}
						size="icon"
						variant="secondary"
					>
						<ChevronLeftIcon size={16} />
					</Button>
					<Separator orientation="vertical" />
					<div className="flex min-w-16 items-center justify-center px-3 text-sm font-medium text-t2">
						{pageIndex + 1} / {pageCount}
					</div>
					<Separator orientation="vertical" />
					<Button
						aria-label="Go to next page"
						className={paginationButtonClassName}
						disabled={!table.getCanNextPage()}
						onClick={() => table.nextPage()}
						size="icon"
						variant="secondary"
					>
						<ChevronRightIcon size={16} />
					</Button>
					<Separator orientation="vertical" />
					<Button
						aria-label="Go to last page"
						className={paginationButtonClassName}
						disabled={!table.getCanNextPage()}
						onClick={() => table.lastPage()}
						size="icon"
						variant="secondary"
					>
						<ChevronLastIcon size={16} />
					</Button>
				</div>
			</div>
		</div>
	);
};
