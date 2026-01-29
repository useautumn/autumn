import { useState } from "react";
import { Table } from "@/components/ui/table";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
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
		table,
		virtualization,
	} = context;
	const sheetType = useSheetStore((s) => s.type);
	const rows = table.getRowModel().rows;

	// Use state instead of ref so changes trigger re-renders for virtualizer
	const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(
		null,
	);

	// Calculate header height for scroll container offset
	const headerHeight = 28; // h-7 = 1.75rem = 28px

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

				{/* Fixed header table - outside scroll container */}
				<div>
					<Table
						className="p-0 w-full rounded-t-lg"
						flexibleTableColumns={flexibleTableColumns}
					>
						<TableHeader />
					</Table>
				</div>

				{/* Scroll container for body only */}
				<div
					ref={setScrollContainer}
					className="rounded-b-lg w-full [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-400 [&::-webkit-scrollbar-thumb]:rounded-full dark:[&::-webkit-scrollbar-thumb]:bg-neutral-600"
					style={{
						maxHeight: virtualization?.containerHeight
							? `calc(${virtualization.containerHeight} - ${headerHeight}px)`
							: undefined,
						willChange: "scroll-position",
						overflow: "auto",
						scrollbarWidth: "thin",
						scrollbarColor: "rgba(155, 155, 155, 0.5) transparent",
					}}
				>
					<Table
						className="p-0 w-full"
						flexibleTableColumns={flexibleTableColumns}
					>
						{children}
					</Table>
				</div>
			</div>
		</TableContext.Provider>
	);
}
