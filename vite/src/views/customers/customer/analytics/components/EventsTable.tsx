import { CaretLeftIcon, CaretRightIcon, DatabaseIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Table } from "@/components/general/table";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { cn } from "@/lib/utils";
import type { IRow } from "./analytics-types";
import { createEventsColumns } from "./EventsColumns";
import { RowClickDialog } from "./RowClickDialog";
import { useEventsTable } from "../hooks/useEventsTable";

const PAGE_SIZE_OPTIONS = [100, 500, 1000];
const columns = createEventsColumns();

export function EventsTable({ data }: { data: IRow[] }) {
	const [selectedEvent, setSelectedEvent] = useState<IRow | null>(null);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const table = useEventsTable({ data, columns });
	const { pageIndex, pageSize } = table.getState().pagination;
	const totalPages = table.getPageCount();
	const currentPage = pageIndex + 1;
	const canGoPrev = table.getCanPreviousPage();
	const canGoNext = table.getCanNextPage();

	const handleRowClick = (row: IRow) => {
		setSelectedEvent(row);
		setIsDialogOpen(true);
	};

	return (
		<>
			<div className="flex items-center justify-between pb-4 h-10">
				<div className="text-t3 text-md flex gap-2 items-center">
					<DatabaseIcon size={16} weight="fill" className="text-subtle" />
					Events
				</div>
				<div className="flex items-center gap-2">
					<Select
						value={pageSize.toString()}
						onValueChange={(value) => {
							table.setPageSize(Number(value));
							table.setPageIndex(0);
						}}
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
						disabled={!canGoPrev}
						className={cn(!canGoPrev && "pointer-events-none opacity-50")}
					/>
					<span className="text-t2 text-xs font-medium">
						{currentPage} / {Math.max(totalPages, 1)}
					</span>
					<IconButton
						variant="secondary"
						size="default"
						icon={<CaretRightIcon size={12} weight="bold" />}
						onClick={() => table.nextPage()}
						disabled={!canGoNext}
						className={cn(!canGoNext && "pointer-events-none opacity-50")}
					/>
				</div>
			</div>
			<Table.Provider
				config={{
					table,
					numberOfColumns: columns.length,
					isLoading: false,
					enableSorting: true,
					onRowClick: handleRowClick,
					rowClassName: "h-10",
					flexibleTableColumns: true,
					virtualization: {
						containerHeight: "calc(100vh - 700px)",
					},
				}}
			>
				<Table.Container>
					<Table.VirtualizedContent>
						<Table.VirtualizedBody />
					</Table.VirtualizedContent>
				</Table.Container>
			</Table.Provider>
			{selectedEvent && (
				<RowClickDialog
					event={selectedEvent}
					isOpen={isDialogOpen}
					setIsOpen={setIsDialogOpen}
				/>
			)}
		</>
	);
}
