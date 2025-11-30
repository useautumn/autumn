import type { Table as TanstackTable } from "@tanstack/react-table";
import { createContext, type ReactNode, useContext } from "react";

export interface TableProps<T> {
	table: TanstackTable<T>;
	numberOfColumns: number;
	isLoading: boolean;
	enableSelection?: boolean;
	enableSorting?: boolean;
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
