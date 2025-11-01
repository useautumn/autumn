import {
	ChevronFirstIcon,
	ChevronLastIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from "lucide-react";
import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent } from "@/components/ui/pagination";
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
import { useTableContext } from "./table-context";

const paginationButtonClassName =
	"disabled:pointer-events-none disabled:opacity-50 rounded-none border-none";

export function TablePagination() {
	const { table } = useTableContext();
	const id = useId();
	return (
		<div className="flex items-center justify-between gap-4 pt-4">
			<div className="flex items-center gap-2">
				<Label
					className="max-sm:sr-only text-xs text-muted-foreground"
					htmlFor={id}
				>
					Rows per page
				</Label>
				<Select
					onValueChange={(value) => {
						table.setPageSize(Number(value));
					}}
					value={table.getState().pagination.pageSize.toString()}
				>
					<SelectTrigger
						className="w-fit whitespace-nowrap rounded-lg p-1 text-xs h-6 pr-0"
						id={id}
					>
						<SelectValue placeholder="Select number of results" />
					</SelectTrigger>
					<SelectContent className="[&_*[role=option]>span]:start-auto [&_*[role=option]>span]:end-2 [&_*[role=option]]:ps-2 [&_*[role=option]]:pe-8">
						{[5, 10, 25, 50].map((pageSize) => (
							<SelectItem key={pageSize} value={pageSize.toString()}>
								{pageSize}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex grow justify-end whitespace-nowrap text-muted-foreground text-sm">
				<p
					aria-live="polite"
					className="flex gap-1 whitespace-nowrap text-muted-foreground text-sm"
				>
					Showing
					<span className="text-foreground">
						{table.getState().pagination.pageIndex *
							table.getState().pagination.pageSize +
							1}
						-
						{Math.min(
							Math.max(
								table.getState().pagination.pageIndex *
									table.getState().pagination.pageSize +
									table.getState().pagination.pageSize,
								0,
							),
							table.getRowCount(),
						)}
					</span>{" "}
					out of
					<span className="text-foreground">
						{table.getRowCount().toString()}
					</span>
				</p>
			</div>

			<div>
				<Pagination>
					<PaginationContent>
						<div className="inline-flex rounded-lg overflow-hidden border border-border">
							<Button
								aria-label="Go to first page"
								className={paginationButtonClassName}
								disabled={!table.getCanPreviousPage()}
								onClick={() => table.firstPage()}
								size="icon"
								variant="secondary"
							>
								<ChevronFirstIcon aria-hidden="true" size={16} />
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
								<ChevronLeftIcon aria-hidden="true" size={16} />
							</Button>
							<Separator orientation="vertical" />
							<div className="flex items-center justify-center px-4 bg-background text-sm font-medium">
								{table.getState().pagination.pageIndex + 1}
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
								<ChevronRightIcon aria-hidden="true" size={16} />
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
								<ChevronLastIcon aria-hidden="true" size={16} />
							</Button>
						</div>
					</PaginationContent>
				</Pagination>
			</div>
		</div>
	);
}
