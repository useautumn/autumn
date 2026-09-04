import { InfoTooltip } from "@autumn/ui";
import type { Table as TableInstance } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { Table } from "@/components/general/table";

interface CreditEditableTableProps<T> {
	title: string;
	hint: string;
	action?: ReactNode;
	table: TableInstance<T>;
	columnCount: number;
	footer: ReactNode;
}

/** A titled, bordered table the credit tables share, with its add control beneath.
 * With no rows only that control shows, so an empty table is just its "add" line. */
export function CreditEditableTable<T>({
	title,
	hint,
	action,
	table,
	columnCount,
	footer,
}: CreditEditableTableProps<T>) {
	const hasRows = table.getRowModel().rows.length > 0;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<span className="flex items-center gap-1.5 text-sm font-medium">
					{title}
					<InfoTooltip>{hint}</InfoTooltip>
				</span>
				{action}
			</div>
			{hasRows && (
				<div className="rounded-lg border shadow-card overflow-hidden">
					<Table.Provider
						config={{
							table,
							numberOfColumns: columnCount,
							isLoading: false,
							enableSorting: false,
							rowClassName: "h-10",
							flexibleTableColumns: true,
						}}
					>
						<Table.Container>
							<Table.Content className="!rounded-none !border-0 !shadow-none [&_[data-slot=table-container]]:rounded-none">
								<Table.Header />
								<Table.Body />
							</Table.Content>
						</Table.Container>
					</Table.Provider>
				</div>
			)}
			{footer}
		</div>
	);
}
