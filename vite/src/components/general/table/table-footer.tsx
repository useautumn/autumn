import type { Table as TanstackTable } from "@tanstack/react-table";
import {
	ChevronFirstIcon,
	ChevronLastIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/v2/buttons/Button";
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
	const id = useId();
	const rowCount = table.getRowCount();
	const pageIndex = table.getState().pagination.pageIndex;
	const pageSize = table.getState().pagination.pageSize;
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
					<Label htmlFor={id} className="text-xs text-muted-foreground">
						Rows per page
					</Label>
					<Select
						onValueChange={(value) => table.setPageSize(Number(value))}
						value={pageSize.toString()}
					>
						<SelectTrigger
							id={id}
							className="h-7 w-fit rounded-lg px-2 text-xs"
						>
							<SelectValue placeholder="Rows" />
						</SelectTrigger>
						<SelectContent className="[&_*[role=option]>span]:start-auto [&_*[role=option]>span]:end-2 [&_*[role=option]]:ps-2 [&_*[role=option]]:pe-8">
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
				<div className="inline-flex overflow-hidden rounded-lg border border-border bg-background">
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
					<div className="flex min-w-10 items-center justify-center px-3 text-sm font-medium">
						{pageIndex + 1}
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
