import { TableColumnVisibility } from "@autumn/ui/components/table/table-column-visibility";
import {
	TableContext,
	useShowMobileCards,
	useTableContext,
} from "@autumn/ui/components/table/table-context";
import { TableHeader } from "@autumn/ui/components/table/table-header";
import { TableMobileCards } from "@autumn/ui/components/table/table-mobile-cards";
import { Table } from "@autumn/ui/components/ui/table";
import { cn } from "@autumn/ui/lib/utils";
import React, { useMemo, useState } from "react";

export function TableContentVirtualized({
	children,
	className,
	footer,
}: {
	children: React.ReactNode;
	className?: string;
	/** Sits inside the table border, below the scroll area, so it never scrolls away. */
	footer?: React.ReactNode;
}) {
	const context = useTableContext();
	const isFlexFill = context.virtualization?.containerHeight === "100%";
	const {
		enableColumnVisibility,
		columnVisibilityInToolbar,
		columnVisibilityClassName,
		table,
		virtualization,
	} = context;
	const { isLoading, isTransitioning } = context;
	const rows = table.getRowModel().rows;
	const showsSkeleton = (isLoading || isTransitioning) && !rows.length;
	const showMobileCards = useShowMobileCards();

	// State, not a ref, so the virtualizer re-renders once the container mounts.
	const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(
		null,
	);

	const rowHeight = virtualization?.rowHeight ?? 40;
	const contentHeight = rows.length * rowHeight;

	// Small tables stay as short as their content; taller ones get a usable floor.
	const MIN_TABLE_HEIGHT = 400;
	const containerHeight = virtualization?.containerHeight;
	const containerHeightPx =
		containerHeight && !containerHeight.startsWith("calc")
			? Number.parseInt(containerHeight, 10)
			: undefined;
	const isShortContainer =
		containerHeightPx !== undefined && containerHeightPx < MIN_TABLE_HEIGHT;
	const minHeight =
		isShortContainer || isFlexFill
			? undefined
			: contentHeight > MIN_TABLE_HEIGHT || showsSkeleton
				? MIN_TABLE_HEIGHT
				: undefined;

	// Declared column widths are the floor before horizontal scrolling kicks in.
	const visibleColumns = table.getVisibleLeafColumns();
	const totalWidth = useMemo(() => {
		return visibleColumns.reduce((sum, col) => sum + col.getSize(), 0);
	}, [visibleColumns]);

	// Remounts the body whenever the visible column set changes.
	const visibleColumnKey = visibleColumns.map((col) => col.id).join(",");

	const contextWithRef = {
		...context,
		scrollContainer,
	};

	if (showMobileCards) {
		return (
			<>
				<TableMobileCards />
				{footer}
			</>
		);
	}

	return (
		<TableContext.Provider value={contextWithRef}>
			<div
				className={cn(
					"rounded-lg border relative z-50 min-w-0 overflow-hidden",
					isFlexFill && "h-full flex flex-col",
					!rows.length &&
						"border-dashed bg-interactive-secondary dark:bg-transparent",
					className,
				)}
			>
				{(isLoading || isTransitioning) && (
					<div className="bg-white/40 dark:bg-black/40 absolute pointer-events-none rounded-lg -inset-[1px] z-70" />
				)}

				{enableColumnVisibility && !columnVisibilityInToolbar && (
					<div
						className={cn(
							"absolute right-7 top-1 z-45",
							columnVisibilityClassName,
						)}
					>
						<TableColumnVisibility />
					</div>
				)}

				<div
					key={visibleColumnKey}
					ref={setScrollContainer}
					className={cn(
						"w-full overflow-auto transition-[max-height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
						isFlexFill && "flex-1 min-h-0",
						showsSkeleton && "overflow-hidden",
					)}
					style={{
						minHeight: isFlexFill ? undefined : minHeight,
						maxHeight: isFlexFill ? undefined : containerHeight,
						height:
							!isFlexFill && showsSkeleton && containerHeight
								? containerHeight
								: undefined,
						willChange: "scroll-position",
					}}
				>
					{/* One table with a sticky thead: separate header/body tables size their
					    columns independently. Fixed layout pins them to the header row. */}
					<Table className="p-0 w-full" style={{ minWidth: `${totalWidth}px` }}>
						<TableHeader />
						{React.Children.map(children, (child) =>
							React.isValidElement(child)
								? React.cloneElement(child, { key: visibleColumnKey })
								: child,
						)}
					</Table>
				</div>
				{footer}
			</div>
		</TableContext.Provider>
	);
}
