import { Table } from "@/components/ui/table";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { TableColumnVisibility } from "./table-column-visibility";
import { useTableContext } from "./table-context";

export function TableContent({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	const { flexibleTableColumns, enableColumnVisibility, table } =
		useTableContext();
	const sheetType = useSheetStore((s) => s.type);
	const rows = table.getRowModel().rows;

	return (
		<div
			className={cn(
				"rounded-lg border shadow-sm relative z-50 min-w-0",
				!rows.length &&
					"border-dashed bg-interactive-secondary dark:bg-transparent shadow-sm dark:shadow-none",
				className,
			)}
		>
			{" "}
			{enableColumnVisibility && (
				<div className="absolute right-2 top-1 z-45 h-fit">
					<TableColumnVisibility />
				</div>
			)}
			{/* OVERLAY */}
			{sheetType && (
				<div className="bg-white/60 dark:bg-black/60 absolute pointer-events-none rounded-lg -inset-[1px] z-70 "></div>
			)}
			<Table
				className="p-0 w-full rounded-lg overflow-auto"
				flexibleTableColumns={flexibleTableColumns}
			>
				{children}
			</Table>
		</div>
	);
}
