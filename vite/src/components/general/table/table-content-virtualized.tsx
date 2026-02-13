import React, { useCallback, useMemo, useRef, useState } from "react";
import { Table } from "@/components/ui/table";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useScrollbarWidth } from "@/hooks/useScrollbarWidth";
import { cn } from "@/lib/utils";
import { TableColumnVisibility } from "./table-column-visibility";
import { TableContext, useTableContext } from "./table-context";
import { TableHeader } from "./table-header";

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
		table,
		virtualization,
	} = context;
	const sheetType = useSheetStore((s) => s.type);
	const rows = table.getRowModel().rows;

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
	const MIN_TABLE_HEIGHT = 400;
	const minHeight =
		contentHeight > MIN_TABLE_HEIGHT ? MIN_TABLE_HEIGHT : undefined;

	// Calculate total width from visible columns to sync header and body tables
	const visibleColumns = table.getVisibleLeafColumns();
	const totalWidth = useMemo(() => {
		return visibleColumns.reduce((sum, col) => sum + col.getSize(), 0);
	}, [visibleColumns]);

	// Create a key that changes when visible columns change to force body remount
	// Using full column IDs ensures any visibility change is detected
	const visibleColumnKey = visibleColumns.map((col) => col.id).join(",");

	// Track scrollbar width to compensate header alignment
	const { scrollbarWidth } = useScrollbarWidth({
		scrollContainer,
		deps: [rows.length],
	});

	// Provide updated context with scroll container to children
	const contextWithRef = {
		...context,
		scrollContainer,
	};

	return (
		<TableContext.Provider value={contextWithRef}>
			<div
				className={cn(
					"rounded-lg shadow-[0_0_8px_rgba(0,0,0,0.04)] border relative z-50 min-w-0 overflow-hidden",
					!rows.length &&
						"border-dashed bg-interactive-secondary dark:bg-transparent",
					className,
				)}
			>
				{/* Overlay - SAME as TableContent */}
				{sheetType && (
					<div className="bg-white/60 dark:bg-black/60 absolute pointer-events-none rounded-lg -inset-[1px] z-70" />
				)}

				{/* Fixed header table - scrolls horizontally in sync with body */}
				<div
					ref={headerRef}
					className="overflow-x-auto overflow-y-hidden scrollbar-none"
					style={{ scrollbarWidth: "none" }}
				>
					<div
						className="relative bg-card border-b"
						style={{
							minWidth: `${totalWidth}px`,
							paddingRight: scrollbarWidth,
						}}
					>
						{/* Column visibility toggle - only render if not in toolbar */}
						{enableColumnVisibility && !columnVisibilityInToolbar && (
							<div className="absolute right-7 top-1 z-45">
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

				{/* Scroll container for body only - key forces remount when columns change */}
				<div
					key={visibleColumnKey}
					ref={setScrollContainer}
					onScroll={handleScroll}
					className="rounded-b-lg w-full overflow-auto"
					style={{
						minHeight,
						maxHeight: virtualization?.containerHeight
							? `calc(${virtualization.containerHeight} - ${headerHeight}px)`
							: undefined,
						willChange: "scroll-position",
					}}
				>
					<Table
						className="p-0 w-full"
						flexibleTableColumns={flexibleTableColumns}
						style={{ minWidth: `${totalWidth}px` }}
					>
						{/* Clone children with key to force remount when columns change */}
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
