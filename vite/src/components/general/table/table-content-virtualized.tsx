import { Table } from "@autumn/ui";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TableColumnVisibility } from "./table-column-visibility";
import {
	TableContext,
	useShowMobileCards,
	useTableContext,
} from "./table-context";
import { TableHeader } from "./table-header";
import { TableMobileCards } from "./table-mobile-cards";

export function TableContentVirtualized({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	const context = useTableContext();
	const {
		flexibleTableColumns,
		enableColumnVisibility,
		columnVisibilityInToolbar,
		columnVisibilityClassName,
		table,
		virtualization,
	} = context;
	const { isLoading, isTransitioning } = context;
	const rows = table.getRowModel().rows;
	const showMobileCards = useShowMobileCards();

	// Use state instead of ref so changes trigger re-renders for virtualizer
	const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(
		null,
	);

	// Ref for header container to sync horizontal scroll
	const headerRef = useRef<HTMLDivElement>(null);

	// Sync header horizontal scroll with body scroll
	const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
		if (headerRef.current) {
			headerRef.current.scrollLeft = e.currentTarget.scrollLeft;
		}
	}, []);

	// Calculate header height for scroll container offset
	const headerHeight = 28; // h-7 = 1.75rem = 28px
	const rowHeight = virtualization?.rowHeight ?? 40;

	// Calculate actual content height based on row count
	const contentHeight = rows.length * rowHeight;

	// minHeight ensures usability on small screens, but only when content would exceed it
	// This allows small tables to be exactly as tall as their content
	// Skip minHeight if containerHeight is explicitly set to a small value
	const MIN_TABLE_HEIGHT = 400;
	const containerHeightPx = virtualization?.containerHeight
		? Number.parseInt(virtualization.containerHeight, 10)
		: undefined;
	const minHeight =
		containerHeightPx && containerHeightPx < MIN_TABLE_HEIGHT
			? undefined
			: contentHeight > MIN_TABLE_HEIGHT
				? MIN_TABLE_HEIGHT
				: undefined;

	const viewportHeight = containerHeightPx
		? containerHeightPx - headerHeight
		: (minHeight ?? Number.POSITIVE_INFINITY);
	const hasVerticalScroll = contentHeight > viewportHeight;
	const scrollbarGutter = hasVerticalScroll ? "stable" : undefined;

	// Calculate total width from visible columns to sync header and body tables
	const visibleColumns = table.getVisibleLeafColumns();
	const totalWidth = useMemo(() => {
		return visibleColumns.reduce((sum, col) => sum + col.getSize(), 0);
	}, [visibleColumns]);

	// Create a key that changes when visible columns change to force body remount
	// Using full column IDs ensures any visibility change is detected
	const visibleColumnKey = visibleColumns.map((col) => col.id).join(",");

	// Provide updated context with scroll container to children
	const contextWithRef = {
		...context,
		scrollContainer,
	};

	const isFlexFill = virtualization?.containerHeight === "100%";

	if (showMobileCards) {
		return <TableMobileCards />;
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

				<div
					ref={headerRef}
					className="overflow-x-auto overflow-y-hidden scrollbar-none shrink-0"
					style={{ scrollbarWidth: "none", scrollbarGutter }}
				>
					<div
						className="relative bg-card border-b"
						style={{ minWidth: `${totalWidth}px` }}
					>
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
						<Table
							className="p-0 w-full rounded-t-lg"
							flexibleTableColumns={flexibleTableColumns}
						>
							<TableHeader hideBorder />
						</Table>
					</div>
				</div>

				<div
					key={visibleColumnKey}
					ref={setScrollContainer}
					onScroll={handleScroll}
					className={cn("w-full overflow-auto", isFlexFill && "flex-1 min-h-0")}
					style={{
						minHeight: isFlexFill ? undefined : minHeight,
						maxHeight:
							!isFlexFill && virtualization?.containerHeight
								? `calc(${virtualization.containerHeight} - ${headerHeight}px)`
								: undefined,
						willChange: "scroll-position",
						scrollbarGutter,
					}}
				>
					<Table
						className="p-0 w-full"
						flexibleTableColumns={flexibleTableColumns}
						style={{ minWidth: `${totalWidth}px` }}
					>
						{React.Children.map(children, (child) =>
							React.isValidElement(child)
								? React.cloneElement(child, { key: visibleColumnKey })
								: child,
						)}
					</Table>
				</div>
			</div>
		</TableContext.Provider>
	);
}
