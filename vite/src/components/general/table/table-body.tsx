import { TableBody as ShadcnTableBody, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useTableContext } from "./table-context";
import { TableEmptyState, TableRowCells } from "./table-row-cells";

export function TableBody() {
	const {
		table,
		numberOfColumns,
		enableSelection,
		isLoading,
		getRowHref,
		onRowClick,
		rowClassName,
		emptyStateChildren,
		emptyStateText,
		selectedItemId,
		flexibleTableColumns,
	} = useTableContext();
	const rows = table.getRowModel().rows;

	// Compute visible column key on every render - table reference is stable so useMemo won't work
	const visibleColumnKey = table
		.getVisibleLeafColumns()
		.map((col) => col.id)
		.join(",");

	if (!rows.length) {
		return (
			<TableEmptyState
				numberOfColumns={numberOfColumns}
				isLoading={isLoading}
				emptyStateChildren={emptyStateChildren}
				emptyStateText={emptyStateText}
			/>
		);
	}

	return (
		<ShadcnTableBody className="divide-y bg-interactive-secondary">
			{rows.map((row) => {
				const isSelected = selectedItemId === (row.original as any).id;
				const rowHref = getRowHref?.(row.original);

				return (
					<TableRow
						className={cn(
							"text-t3 transition-none h-12 py-4 relative",
							rowClassName,
							isSelected ? "z-100" : "hover:bg-interactive-secondary-hover",
						)}
						data-state={row.getIsSelected() && "selected"}
						key={row.id}
						onClick={!rowHref ? () => onRowClick?.(row.original) : undefined}
					>
						<TableRowCells
							row={row}
							enableSelection={enableSelection}
							flexibleTableColumns={flexibleTableColumns}
							rowHref={rowHref}
							visibleColumnKey={visibleColumnKey}
						/>
					</TableRow>
				);
			})}
		</ShadcnTableBody>
	);
}
