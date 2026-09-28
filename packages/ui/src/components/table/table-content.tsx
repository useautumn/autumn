import { TableColumnVisibility } from "@autumn/ui/components/table/table-column-visibility";
import {
	useShowMobileCards,
	useTableContext,
} from "@autumn/ui/components/table/table-context";
import { TableMobileCards } from "@autumn/ui/components/table/table-mobile-cards";
import { TABLE_TRAY_CLASS } from "@autumn/ui/components/table/table-tray-classes";
import { Table } from "@autumn/ui/components/ui/table";
import { cn } from "@autumn/ui/lib/utils";

export function TableContent({
	children,
	className,
	footer,
}: {
	children: React.ReactNode;
	className?: string;
	/** Sits on the tray below the rows. */
	footer?: React.ReactNode;
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
	const showsSkeleton = (isLoading || isTransitioning) && !rows.length;

	if (showMobileCards) {
		return (
			<>
				<TableMobileCards />
				{footer}
			</>
		);
	}

	return (
		<div
			className={cn(
				"relative z-50 min-w-0",
				TABLE_TRAY_CLASS,
				className,
				showsSkeleton && "overflow-hidden",
			)}
		>
			{(isLoading || isTransitioning) && (
				<div className="bg-white/40 dark:bg-black/40 absolute pointer-events-none rounded-xl -inset-[1px] z-70" />
			)}
			{enableColumnVisibility && (
				<div className="absolute right-2 top-1 z-45 h-fit">
					<TableColumnVisibility />
				</div>
			)}
			<Table
				className={cn(
					"p-0 w-full overflow-auto",
					showsSkeleton && "overflow-hidden",
				)}
				flexibleTableColumns={flexibleTableColumns}
			>
				{children}
			</Table>
			{footer}
		</div>
	);
}
