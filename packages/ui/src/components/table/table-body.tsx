import { useRef } from "react";
import { TableCell, TableRow } from "../ui/table";
import { cn } from "../../lib/utils";
import { useTableContext } from "./table-context";
import { MotionTbody, TABLE_FADE_IN, TABLE_TRANSITION } from "./table-motion";
import { TableRowCells, TableSkeletonRows } from "./table-row-cells";

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
		skeleton: col.columnDef.meta?.skeleton,
	}));

	if (showSkeleton) {
		return (
			<MotionTbody
				key="skeleton"
				{...TABLE_FADE_IN}
				transition={TABLE_TRANSITION}
				className="divide-y bg-interactive-secondary"
			>
				<TableSkeletonRows
					columns={columns}
					rowCount={lastRowCountRef.current}
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
				<TableRow className="hover:bg-transparent dark:hover:bg-transparent">
					<TableCell
						className="h-10 text-center py-0"
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
		<MotionTbody
			key="content"
			{...TABLE_FADE_IN}
			transition={TABLE_TRANSITION}
			className="divide-y bg-interactive-secondary"
		>
			{rows.map((row) => {
				const isSelected = selectedItemId === (row.original as any).id;
				const rowHref = getRowHref?.(row.original);

				return (
					<TableRow
						className={cn(
							"text-tertiary-foreground transition-none h-12 py-4 relative",
							rowClassName,
							isSelected ? "z-100" : "hover:bg-interactive-secondary-hover",
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
