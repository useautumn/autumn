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
				{/* Column visibility toggle - adjusted for scrollbar gutter */}
				{enableColumnVisibility && (
					<div className="absolute right-8 top-1 z-45 h-fit">
						<TableColumnVisibility />
					</div>
				)}

				{/* Overlay - SAME as TableContent */}
				{sheetType && (
					<div className="bg-white/60 dark:bg-black/60 absolute pointer-events-none rounded-lg -inset-[1px] z-70" />
				)}

				{/* Scroll container wrapping the table */}
				<div
					ref={scrollContainerRef}
					className="overflow-auto rounded-lg w-full [&::-webkit-scrollbar-track]:mt-7 [&::-webkit-scrollbar-thumb]:mt-7"
					style={{ 
						height: virtualization?.containerHeight,
						scrollbarGutter: 'stable',
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
