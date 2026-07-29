"use client";

import "@autumn/ui/components/table/table-meta";
import { TableActions } from "@autumn/ui/components/table/table-actions";
import { TableBody } from "@autumn/ui/components/table/table-body";
import { TableBodyVirtualized } from "@autumn/ui/components/table/table-body-virtualized";
import { TableColumnVisibility } from "@autumn/ui/components/table/table-column-visibility";
import { TableContainer } from "@autumn/ui/components/table/table-container";
import { TableContent } from "@autumn/ui/components/table/table-content";
import { TableContentVirtualized } from "@autumn/ui/components/table/table-content-virtualized";
import { TableFooter } from "@autumn/ui/components/table/table-footer";
import { TableHeader } from "@autumn/ui/components/table/table-header";
import { TableHeading } from "@autumn/ui/components/table/table-heading";
import { TablePagination } from "@autumn/ui/components/table/table-pagination";
import { TablePaginationFooter } from "@autumn/ui/components/table/table-pagination-footer";
import { TableProvider } from "@autumn/ui/components/table/table-provider";
import { TableToolbar } from "@autumn/ui/components/table/table-toolbar";

export const Table = {
	Actions: TableActions,
	Toolbar: TableToolbar,
	Provider: TableProvider,
	Content: TableContent,
	VirtualizedContent: TableContentVirtualized,
	Header: TableHeader,
	Heading: TableHeading,
	Footer: TableFooter,
	PaginationFooter: TablePaginationFooter,
	Body: TableBody,
	VirtualizedBody: TableBodyVirtualized,
	Container: TableContainer,
	Pagination: TablePagination,
	ColumnVisibility: TableColumnVisibility,
};

export * from "@autumn/ui/components/table/cursor-pagination";
export {
	type TableLinkComponent,
	type TableProps,
	useTableContext,
} from "@autumn/ui/components/table/table-context";
export { TableDropdownMenuCell } from "@autumn/ui/components/table/table-dropdown-menu-cell";
export { TableProvider } from "@autumn/ui/components/table/table-provider";
export type { ColumnSkeletonMeta } from "@autumn/ui/components/table/table-row-cells";
export * from "@autumn/ui/components/table/table-skeleton-presets";
export { useCursorPagination } from "@autumn/ui/components/table/use-cursor-pagination";
