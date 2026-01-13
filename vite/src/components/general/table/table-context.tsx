import type { Table as TanstackTable } from "@tanstack/react-table";
import { createContext, type ReactNode, useContext } from "react";
import type { ColumnGroup } from "@/hooks/useColumnVisibility";

export interface TableProps<T> {
	table: TanstackTable<T>;
	numberOfColumns: number;
	isLoading: boolean;
	enableSelection?: boolean;
	enableSorting?: boolean;
	enableColumnVisibility?: boolean;
	columnVisibilityStorageKey?: string;
	/** Column groups for UI organization (renders as submenus in visibility dropdown) */
	columnGroups?: ColumnGroup[];
	/** For navigation - returns href string, enables cmd+click to open in new tab */
	getRowHref?: (row: T) => string;
	/** For non-navigation actions like opening sheets/modals */
	onRowClick?: (row: T) => void;
	rowClassName?: string;
	emptyStateChildren?: ReactNode;
	emptyStateText?: string;
	flexibleTableColumns?: boolean;
	selectedItemId?: string | null;
}

//biome-ignore lint/suspicious/noExplicitAny: type could be any here
export const TableContext = createContext<TableProps<any> | null>(null);

export function useTableContext<T>(): TableProps<T> {
	const context = useContext(TableContext);

	if (!context) {
		throw new Error("Table context is not available");
	}

	return context as TableProps<T>;
}
