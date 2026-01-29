import { useVirtualizer } from "@tanstack/react-virtual";
import { TableBody as ShadcnTableBody, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useTableContext } from "./table-context";
import { TableEmptyState, TableRowCells } from "./table-row-cells";

const DEFAULT_ROW_HEIGHT = 40;
const DEFAULT_OVERSCAN = 20;

export function TableBodyVirtualized() {
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
		virtualization,
		scrollContainerRef,
	} = useTableContext();

	const rows = table.getRowModel().rows;
	const rowHeight = virtualization?.rowHeight ?? DEFAULT_ROW_HEIGHT;
	const overscan = virtualization?.overscan ?? DEFAULT_OVERSCAN;

	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollContainerRef?.current ?? null,
		estimateSize: () => rowHeight,
		overscan,
	});

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

	const virtualRows = virtualizer.getVirtualItems();

	// Padding-based virtualization - creates scroll space without absolute positioning
	const paddingTop = virtualRows[0]?.start ?? 0;
	const paddingBottom =
		virtualizer.getTotalSize() -
		(virtualRows[virtualRows.length - 1]?.end ?? 0);

	return (
		<ShadcnTableBody className="bg-interactive-secondary">
			{/* Top spacer row */}
			{paddingTop > 0 && (
				<tr style={{ height: `${paddingTop}px` }}>
					<td
						colSpan={numberOfColumns}
						style={{ padding: 0, border: "none" }}
					/>
				</tr>
			)}

			{/* Visible rows */}
			{virtualRows.map((virtualRow) => {
				const row = rows[virtualRow.index];
				const isSelected = selectedItemId === (row.original as any).id;
				const rowHref = getRowHref?.(row.original);

				return (
					<TableRow
						key={row.id}
						data-state={row.getIsSelected() && "selected"}
						className={cn(
							"text-t3 transition-none h-12 py-4 relative border-b",
							rowClassName,
							isSelected ? "z-100" : "hover:bg-interactive-secondary-hover",
						)}
						onClick={!rowHref ? () => onRowClick?.(row.original) : undefined}
						onContextMenu={(e) => {
							if (rowHref) {
								e.preventDefault();
								window.open(rowHref, "_blank", "noopener,noreferrer");
								window.focus();
							}
						}}
					>
						<TableRowCells
							row={row}
							enableSelection={enableSelection}
							flexibleTableColumns={flexibleTableColumns}
							rowHref={rowHref}
						/>
					</TableRow>
				);
			})}

			{/* Bottom spacer row */}
			{paddingBottom > 0 && (
				<tr style={{ height: `${paddingBottom}px` }}>
					<td
						colSpan={numberOfColumns}
						style={{ padding: 0, border: "none" }}
					/>
				</tr>
			)}
		</ShadcnTableBody>
	);
}
