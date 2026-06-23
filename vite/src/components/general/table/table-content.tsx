import { Table } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TableColumnVisibility } from "./table-column-visibility";
import { useShowMobileCards, useTableContext } from "./table-context";
import { TableMobileCards } from "./table-mobile-cards";

export function TableContent({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	const {
		flexibleTableColumns,
		enableColumnVisibility,
		isLoading,
		isTransitioning,
		table,
	} = useTableContext();
	const rows = table.getRowModel().rows;
	const showMobileCards = useShowMobileCards();

	if (showMobileCards) {
		return <TableMobileCards />;
	}

	return (
		<div
			className={cn(
				"rounded-lg border relative z-50 min-w-0",
				!rows.length && "border-dashed",
				className,
			)}
		>
			{(isLoading || isTransitioning) && (
				<div className="bg-white/40 dark:bg-black/40 absolute pointer-events-none rounded-lg -inset-[1px] z-70" />
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
