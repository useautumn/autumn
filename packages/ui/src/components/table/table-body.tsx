import { useTableContext } from "@autumn/ui/components/table/table-context";
import {
	MotionTbody,
	TABLE_FADE_IN,
	TABLE_TRANSITION,
} from "@autumn/ui/components/table/table-motion";
import {
	TableRowCells,
	TableSkeletonRows,
} from "@autumn/ui/components/table/table-row-cells";
import {
	TABLE_TRAY_CELL_CLASS,
	TABLE_TRAY_ROW_CLASS,
} from "@autumn/ui/components/table/table-tray-classes";
import { TableCell, TableRow } from "@autumn/ui/components/ui/table";
import { cn } from "@autumn/ui/lib/utils";
import { useRef } from "react";

const DEFAULT_SKELETON_ROWS = 5;

export function TableBody() {
	const {
		table,
		numberOfColumns,
		enableSelection,
		isLoading,
		isTransitioning,
		getRowHref,
		onRowClick,
		onRowDoubleClick,
		rowClassName,
		emptyStateChildren,
		emptyStateText,
		selectedItemId,
		flexibleTableColumns,
		getRowClassName,
		skeletonRowCount,
	} = useTableContext();
	const rows = table.getRowModel().rows;
	const lastRowCountRef = useRef(DEFAULT_SKELETON_ROWS);
	const hasLoadedRef = useRef(false);

	if (rows.length > 0) lastRowCountRef.current = rows.length;
	if (!isLoading) hasLoadedRef.current = true;

	const hasRows = rows.length > 0;
	const showSkeleton =
		isLoading || !!isTransitioning || (!hasRows && !hasLoadedRef.current);

	const columns = table.getVisibleLeafColumns().map((col) => ({
		id: col.id,
		size: col.getSize(),
		grow: col.columnDef.meta?.grow,
		skeleton: col.columnDef.meta?.skeleton,
	}));

	if (showSkeleton) {
		return (
			<MotionTbody
				key="skeleton"
				{...TABLE_FADE_IN}
				transition={TABLE_TRANSITION}
			>
				<TableSkeletonRows
					columns={columns}
					rowCount={skeletonRowCount ?? lastRowCountRef.current}
					rowClassName={rowClassName}
					flexibleTableColumns={flexibleTableColumns}
					asFragment
				/>
			</MotionTbody>
		);
	}

	if (!hasRows) {
		return (
			<MotionTbody key="empty" {...TABLE_FADE_IN} transition={TABLE_TRANSITION}>
				<TableRow className={TABLE_TRAY_ROW_CLASS}>
					<TableCell
						className={cn(TABLE_TRAY_CELL_CLASS, "h-10 text-center py-0")}
						colSpan={numberOfColumns}
					>
						<div className="text-subtle text-xs text-center w-full h-full items-center justify-center flex">
							{emptyStateChildren || emptyStateText}
						</div>
					</TableCell>
				</TableRow>
			</MotionTbody>
		);
	}

	const visibleColumnKey = table
		.getVisibleLeafColumns()
		.map((col) => col.id)
		.join(",");

	return (
		<MotionTbody key="content" {...TABLE_FADE_IN} transition={TABLE_TRANSITION}>
			{rows.map((row) => {
				const isSelected = selectedItemId === (row.original as any).id;
				const rowHref = getRowHref?.(row.original);

				return (
					<TableRow
						className={cn(
							TABLE_TRAY_ROW_CLASS,
							"text-tertiary-foreground transition-none h-12 py-4 relative",
							rowClassName,
							getRowClassName?.(row.original),
							isSelected && "z-100",
							(onRowClick || rowHref) && "cursor-pointer",
						)}
						data-state={row.getIsSelected() && "selected"}
						key={row.id}
						onClick={!rowHref ? () => onRowClick?.(row.original) : undefined}
						onDoubleClick={
							onRowDoubleClick
								? () => onRowDoubleClick(row.original)
								: undefined
						}
					>
						<TableRowCells
							row={row}
							enableSelection={enableSelection}
							flexibleTableColumns={flexibleTableColumns}
							rowHref={rowHref}
							visibleColumnKey={visibleColumnKey}
							isExpanded={row.getIsExpanded()}
						/>
					</TableRow>
				);
			})}
		</MotionTbody>
	);
}
