import { useRef } from "react";
import { Table } from "@/components/ui/table";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { TableColumnVisibility } from "./table-column-visibility";
import { TableContext, useTableContext } from "./table-context";

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
		table,
		virtualization,
	} = context;
	const sheetType = useSheetStore((s) => s.type);
	const rows = table.getRowModel().rows;

	// Create the scroll container ref
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	// Provide updated context with scrollContainerRef to children
	const contextWithRef = {
		...context,
		scrollContainerRef,
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
				{/* Column visibility toggle */}
				{enableColumnVisibility && (
					<div className="absolute right-7 top-1 z-45 h-fit">
						<TableColumnVisibility />
					</div>
				)}

				{/* Overlay - SAME as TableContent */}
				{sheetType && (
					<div className="bg-white/60 dark:bg-black/60 absolute pointer-events-none rounded-lg -inset-[1px] z-70" />
				)}

				{/* Scroll container wrapping the table - optimized for fast scrolling */}
				<div
					ref={scrollContainerRef}
					className="rounded-lg w-full [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-track]:mt-7 [&::-webkit-scrollbar-thumb]:bg-neutral-400 [&::-webkit-scrollbar-thumb]:rounded-full dark:[&::-webkit-scrollbar-thumb]:bg-neutral-600"
					style={{
						height: virtualization?.containerHeight,
						willChange: "scroll-position",
						contain: "strict",
						overflow: "auto",
						scrollbarWidth: "thin",
						scrollbarColor: "rgba(155, 155, 155, 0.5) transparent",
					}}
				>
					<Table
						className="p-0 w-full rounded-lg"
						flexibleTableColumns={flexibleTableColumns}
					>
						{children}
					</Table>
				</div>
			</div>
		</TableContext.Provider>
	);
}
