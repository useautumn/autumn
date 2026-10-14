import type { ColumnGroup } from "@autumn/ui/hooks/use-column-visibility";
import { useIsMobile } from "@autumn/ui/hooks/use-is-mobile";
import type { Table as TanstackTable } from "@tanstack/react-table";
import {
	type ComponentType,
	createContext,
	type ReactNode,
	useContext,
} from "react";

export type TableLinkComponent = ComponentType<{
	to: string;
	className?: string;
	children: ReactNode;
}>;

export interface VirtualizationConfig {
	containerHeight?: string;
	rowHeight?: number;
	overscan?: number;
	skeletonRowCount?: number;
}

export interface TableProps<T> {
	table: TanstackTable<T>;
	numberOfColumns: number;
	isLoading: boolean;
	isTransitioning?: boolean;
	skeletonRowCount?: number;
	enableSelection?: boolean;
	enableSorting?: boolean;
	enableColumnVisibility?: boolean;
	columnVisibilityStorageKey?: string;
	columnGroups?: ColumnGroup[];
	columnVisibilityIsDirty?: boolean;
	onColumnVisibilitySave?: () => void;
	columnVisibilityInToolbar?: boolean;
	columnVisibilityClassName?: string;
	getRowHref?: (row: T) => string;
	linkComponent?: TableLinkComponent;
	onRowClick?: (row: T) => void;
	onRowDoubleClick?: (row: T) => void;
	rowClassName?: string;
	getRowClassName?: (row: T) => string | undefined;
	emptyStateChildren?: ReactNode;
	emptyStateText?: string;
	flexibleTableColumns?: boolean;
	mobileCards?: boolean;
	selectedItemId?: string | null;
	virtualization?: VirtualizationConfig;
	scrollContainer?: HTMLDivElement | null;
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

export function useShowMobileCards(): boolean {
	const { mobileCards } = useTableContext();
	const isMobile = useIsMobile();
	return Boolean(mobileCards) && isMobile;
}
