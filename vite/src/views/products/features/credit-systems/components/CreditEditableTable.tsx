import type { Table as TableInstance } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { Table } from "@/components/general/table";

interface CreditEditableTableProps<T> {
	table: TableInstance<T>;
	columnCount: number;
	footer: ReactNode;
}

/** The bordered, flexible-column table shell the credit tables share, with an action strip beneath. */
export function CreditEditableTable<T>({
	table,
	columnCount,
	footer,
}: CreditEditableTableProps<T>) {
	return (
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
					<Table.Content className="!rounded-none !border-0 !shadow-none">
						<Table.Header />
						<Table.Body />
					</Table.Content>
				</Table.Container>
			</Table.Provider>
			<div className="flex items-center gap-1 w-full px-4 py-1.5 text-xs text-muted-foreground bg-interactive-secondary border-t border-border">
				{footer}
			</div>
		</div>
	);
}
