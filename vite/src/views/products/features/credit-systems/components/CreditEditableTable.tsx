import type { Table as TableInstance } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { Table } from "@/components/general/table";
import { cn } from "@/lib/utils";

interface CreditEditableTableProps<T> {
	title: string;
	description: string;
	table: TableInstance<T>;
	columnCount: number;
	footer: ReactNode;
}

/** A titled, bordered table the credit tables share, with an action strip beneath.
 * With no rows only the strip shows, so an empty table is just its "add" line. */
export function CreditEditableTable<T>({
	title,
	description,
	table,
	columnCount,
	footer,
}: CreditEditableTableProps<T>) {
	const hasRows = table.getRowModel().rows.length > 0;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-col gap-0.5">
				<span className="text-sm font-medium">{title}</span>
				<span className="text-xs text-muted-foreground">{description}</span>
			</div>
			<div className="rounded-lg border shadow-card overflow-hidden">
				{hasRows && (
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
				)}
				<div
					className={cn(
						"flex items-center gap-1 w-full px-4 py-1.5 text-xs text-muted-foreground bg-interactive-secondary",
						hasRows && "border-t border-border",
					)}
				>
					{footer}
				</div>
			</div>
		</div>
	);
}
