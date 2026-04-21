import { Table } from "@/components/ui/table";
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
	const { flexibleTableColumns, enableColumnVisibility, isLoading, table } =
		useTableContext();
	const rows = table.getRowModel().rows;

	return (
		<div
			className={cn(
				"rounded-lg shadow-card border relative z-50 min-w-0",
				!rows.length && "border-dashed shadow-none",
				className,
			)}
		>
			{isLoading && (
				<div className="bg-white/60 dark:bg-black/60 absolute pointer-events-none rounded-lg -inset-[1px] z-70" />
			)}
			{enableColumnVisibility && (
				<div className="absolute right-2 top-1 z-45 h-fit">
					<TableColumnVisibility />
				</div>
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
