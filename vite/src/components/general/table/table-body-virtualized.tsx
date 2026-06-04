import type { Row } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useMemo, useRef } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useTableContext } from "./table-context";
import { MotionTbody, TABLE_FADE_IN, TABLE_TRANSITION } from "./table-motion";
import { TableRowCells, TableSkeletonRows } from "./table-row-cells";

const DEFAULT_ROW_HEIGHT = 40;
const DEFAULT_OVERSCAN = 30;

interface VirtualRowProps<T> {
	row: Row<T>;
	virtualRow: VirtualItem;
	isSelected: boolean;
	rowHref?: string;
	rowClassName?: string;
	enableSelection?: boolean;
	flexibleTableColumns?: boolean;
	onRowClick?: (row: T) => void;
	onRowDoubleClick?: (row: T) => void;
	visibleColumnKey?: string;
}

/** Memoized row component - only re-renders when row data changes */
const VirtualRowInner = <T,>({
	row,
	virtualRow,
	isSelected,
	rowHref,
	rowClassName,
	enableSelection,
	flexibleTableColumns,
	onRowClick,
	onRowDoubleClick,
	visibleColumnKey,
}: VirtualRowProps<T>) => {
	const handleClick = useCallback(() => {
		if (!rowHref) onRowClick?.(row.original);
	}, [rowHref, onRowClick, row.original]);

	const handleDoubleClick = useCallback(() => {
		onRowDoubleClick?.(row.original);
	}, [onRowDoubleClick, row.original]);

	return (
		<TableRow
			data-state={row.getIsSelected() && "selected"}
			data-index={virtualRow.index}
			className={cn(
				"text-tertiary-foreground transition-none h-10 relative border-b last:border-b-0",
				rowClassName,
				isSelected ? "z-100" : "hover:bg-interactive-secondary-hover",
				(onRowClick || rowHref) && "cursor-pointer",
			)}
			onClick={handleClick}
			onDoubleClick={onRowDoubleClick ? handleDoubleClick : undefined}
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
};

// Memoize with custom comparator for optimal performance
const VirtualRow = memo(VirtualRowInner, (prevProps, nextProps) => {
	// Only re-render if essential data changed
	// Check row.original identity to handle data changes with keepPreviousData
	// Check visibleColumnKey to handle column visibility changes (not just length)
	return (
		prevProps.row.id === nextProps.row.id &&
		prevProps.row.original === nextProps.row.original &&
		prevProps.isSelected === nextProps.isSelected &&
		prevProps.row.getIsSelected() === nextProps.row.getIsSelected() &&
		prevProps.rowHref === nextProps.rowHref &&
		prevProps.virtualRow.index === nextProps.virtualRow.index &&
		prevProps.rowClassName === nextProps.rowClassName &&
		prevProps.visibleColumnKey === nextProps.visibleColumnKey
	);
}) as typeof VirtualRowInner;

export function TableBodyVirtualized() {
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
		virtualization,
		scrollContainer,
	} = useTableContext();

	const rows = table.getRowModel().rows;
	const rowHeight = virtualization?.rowHeight ?? DEFAULT_ROW_HEIGHT;
	const overscan = virtualization?.overscan ?? DEFAULT_OVERSCAN;
	const lastRowCountRef = useRef(20);
	const hasLoadedRef = useRef(false);

	if (rows.length > 0) lastRowCountRef.current = rows.length;
	if (!isLoading) hasLoadedRef.current = true;

	const hasRows = rows.length > 0;
	const showSkeleton =
		isLoading || !!isTransitioning || (!hasRows && !hasLoadedRef.current);

	// Don't initialize virtualizer until scroll container is ready
	// This prevents incorrect virtual item calculations on initial render
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollContainer ?? null,
		estimateSize: () => rowHeight,
		overscan,
		enabled: !!scrollContainer,
	});

	// Memoize virtual items to prevent unnecessary recalculations
	const virtualRows = virtualizer.getVirtualItems();

	// Memoize padding calculations
	const { paddingTop, paddingBottom } = useMemo(() => {
		const top = virtualRows[0]?.start ?? 0;
		const bottom =
			virtualizer.getTotalSize() -
			(virtualRows[virtualRows.length - 1]?.end ?? 0);
		return { paddingTop: top, paddingBottom: bottom };
	}, [virtualRows, virtualizer]);

	// Memoize the onRowClick handler
	const memoizedOnRowClick = useCallback(
		(original: unknown) => {
			onRowClick?.(original);
		},
		[onRowClick],
	);

	const memoizedOnRowDoubleClick = useCallback(
		(original: unknown) => {
			onRowDoubleClick?.(original);
		},
		[onRowDoubleClick],
	);

	// Compute visible column key on every render - table reference is stable so useMemo won't work
	const visibleColumnKey = table
		.getVisibleLeafColumns()
		.map((col) => col.id)
		.join(",");

	const columns = table.getVisibleLeafColumns().map((col) => ({
		id: col.id,
		size: col.getSize(),
		skeleton: col.columnDef.meta?.skeleton,
	}));

	const containerPx = scrollContainer?.clientHeight ?? 0;
	const skeletonRowCount = containerPx > 0
		? Math.max(1, Math.floor(containerPx / rowHeight))
		: lastRowCountRef.current;

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
					rowCount={skeletonRowCount}
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

	return (
		<MotionTbody
			key="content"
			{...TABLE_FADE_IN}
			transition={TABLE_TRANSITION}
			className="bg-interactive-secondary"
		>
			{paddingTop > 0 && (
				<tr style={{ height: paddingTop }}>
					<td
						colSpan={numberOfColumns}
						style={{ padding: 0, border: "none" }}
					/>
				</tr>
			)}

			{virtualRows.map((virtualRow) => {
				const row = rows[virtualRow.index];
				const isSelected =
					selectedItemId === (row.original as { id?: string }).id;
				const rowHref = getRowHref?.(row.original);

				return (
					<VirtualRow
						key={row.id}
						row={row}
						virtualRow={virtualRow}
						isSelected={isSelected}
						rowHref={rowHref}
						rowClassName={rowClassName}
						enableSelection={enableSelection}
						flexibleTableColumns={flexibleTableColumns}
						onRowClick={memoizedOnRowClick}
						onRowDoubleClick={memoizedOnRowDoubleClick}
						visibleColumnKey={visibleColumnKey}
					/>
				);
			})}

			{paddingBottom > 0 && (
				<tr style={{ height: paddingBottom }}>
					<td
						colSpan={numberOfColumns}
						style={{ padding: 0, border: "none" }}
					/>
				</tr>
			)}
		</MotionTbody>
	);
}
