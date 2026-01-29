import type { Table as TanstackTable } from "@tanstack/react-table";
import { createContext, type ReactNode, useContext } from "react";
import type { ColumnGroup } from "@/hooks/useColumnVisibility";

export interface VirtualizationConfig {
	/** Height of the scroll container, e.g., "calc(100vh - 240px)" */
	containerHeight: string;
	/** Height of each row in pixels (default: 40) */
	rowHeight?: number;
	/** Number of rows to render outside visible area (default: 30) - higher values improve fast scrolling smoothness */
	overscan?: number;
}

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
	/** Render column visibility in the toolbar instead of inside table content */
	columnVisibilityInToolbar?: boolean;
	/** For navigation - returns href string, enables cmd+click to open in new tab */
	getRowHref?: (row: T) => string;
	/** For non-navigation actions like opening sheets/modals */
	onRowClick?: (row: T) => void;
	rowClassName?: string;
	emptyStateChildren?: ReactNode;
	emptyStateText?: string;
	flexibleTableColumns?: boolean;
	selectedItemId?: string | null;
	/** Virtualization config - only needed when using VirtualizedContent/VirtualizedBody */
	virtualization?: VirtualizationConfig;
	/** Scroll container element - set internally by VirtualizedContent, used by VirtualizedBody */
	scrollContainer?: HTMLDivElement | null;
	/** Key that changes when visible columns change - used for memo invalidation */
	visibleColumnKey?: string;
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
