import { CaretLeftIcon, CaretRightIcon, DatabaseIcon } from "@phosphor-icons/react";
import { memo, useState } from "react";
import { Table } from "@/components/general/table";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { cn } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { IRow } from "./analytics-types";
import { createEventsColumns } from "./EventsColumns";
import { RowClickDialog } from "./RowClickDialog";
import { useEventsTable } from "../hooks/useEventsTable";

const PAGE_SIZE_OPTIONS = [100, 500, 1000] as const;
const columns = createEventsColumns();

const SKELETON_CELL_WIDTHS = ["w-28", "w-20", "w-8", "w-40"] as const;

const skeletonColumns: ColumnDef<IRow, unknown>[] = columns.map((col, i) => ({
	...col,
	cell: () => <Skeleton className={cn("h-3 rounded-sm", SKELETON_CELL_WIDTHS[i])} />,
}));

const PLACEHOLDER_ROWS: IRow[] = Array.from({ length: 15 }, (_, i) => ({
	timestamp: "",
	event_name: "",
	value: 0,
	properties: "",
	idempotency_key: String(i),
	entity_id: "",
	customer_id: "",
}));

export const EventsTable = memo(function EventsTable({
	data,
	isLoading = false,
	emptyMessage = "No events to display.",
	className,
}: {
	data: IRow[];
	isLoading?: boolean;
	emptyMessage?: string;
	className?: string;
}) {
	const [selectedEvent, setSelectedEvent] = useState<IRow | null>(null);
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	const tableData = isLoading ? PLACEHOLDER_ROWS : data;
	const activeColumns = isLoading ? skeletonColumns : columns;
	const table = useEventsTable({ data: tableData, columns: activeColumns });

	const { pageIndex, pageSize } = table.getState().pagination;
	const totalPages = table.getPageCount();
	const currentPage = pageIndex + 1;
	const canGoPrev = table.getCanPreviousPage();
	const canGoNext = table.getCanNextPage();
	const isDisabled = isLoading;

	const handleRowClick = isLoading
		? undefined
		: (row: IRow) => {
				setSelectedEvent(row);
				setIsDialogOpen(true);
			};

	const isEmpty = !isLoading && data.length === 0;

	return (
		<div className={cn("h-full flex flex-col", className)}>
			<div className="flex items-center justify-between pb-4 h-10 shrink-0">
				<div className="text-tertiary-foreground text-md flex gap-2 items-center">
					<DatabaseIcon size={16} weight="fill" className="text-subtle" />
					Events
				</div>
				{!isEmpty && (
					<div className="flex items-center gap-2">
						<Select
							value={pageSize.toString()}
							onValueChange={(value) => {
								table.setPageSize(Number(value));
								table.setPageIndex(0);
							}}
							disabled={isDisabled}
						>
							<SelectTrigger className="h-7 w-fit px-2 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PAGE_SIZE_OPTIONS.map((size) => (
									<SelectItem key={size} value={size.toString()}>
										{size}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<IconButton
							variant="secondary"
							size="default"
							icon={<CaretLeftIcon size={12} weight="bold" />}
							onClick={() => table.previousPage()}
							disabled={!canGoPrev || isDisabled}
							className={cn((!canGoPrev || isDisabled) && "pointer-events-none opacity-50")}
						/>
						<span className="text-muted-foreground text-xs font-medium">
							{isLoading ? "–" : `${currentPage} / ${Math.max(totalPages, 1)}`}
						</span>
						<IconButton
							variant="secondary"
							size="default"
							icon={<CaretRightIcon size={12} weight="bold" />}
							onClick={() => table.nextPage()}
							disabled={!canGoNext || isDisabled}
							className={cn((!canGoNext || isDisabled) && "pointer-events-none opacity-50")}
						/>
					</div>
				)}
			</div>
			{isEmpty ? (
				<div className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-interactive-secondary min-h-[200px]">
					<DatabaseIcon size={28} weight="duotone" className="text-muted-foreground/50" />
					<p className="text-muted-foreground text-sm">{emptyMessage}</p>
				</div>
			) : (
				<Table.Provider
					config={{
						table,
						numberOfColumns: activeColumns.length,
						isLoading: false,
						enableSorting: !isLoading,
						onRowClick: handleRowClick,
						rowClassName: "h-8",
						flexibleTableColumns: true,
						virtualization: {
							containerHeight: "100%",
							rowHeight: 32,
						},
					}}
				>
					<Table.Container className="flex-1 min-h-0">
						<Table.VirtualizedContent className="h-full">
							<Table.VirtualizedBody />
						</Table.VirtualizedContent>
					</Table.Container>
				</Table.Provider>
			)}
			{selectedEvent && (
				<RowClickDialog
					event={selectedEvent}
					isOpen={isDialogOpen}
					setIsOpen={setIsDialogOpen}
				/>
			)}
		</div>
	);
});
