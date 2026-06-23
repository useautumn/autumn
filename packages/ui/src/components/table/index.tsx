"use client";

import "./table-meta";
import { TablePaginationFooter } from "./TablePaginationFooter";
import { TableActions } from "./table-actions";
import { TableBody } from "./table-body";
import { TableBodyVirtualized } from "./table-body-virtualized";
import { TableColumnVisibility } from "./table-column-visibility";
import { TableContainer } from "./table-container";
import { TableContent } from "./table-content";
import { TableContentVirtualized } from "./table-content-virtualized";
import { TableFooter } from "./table-footer";
import { TableHeader } from "./table-header";
import { TableHeading } from "./table-heading";
import { TablePagination } from "./table-pagination";
import { TableProvider } from "./table-provider";
import { TableToolbar } from "./table-toolbar";

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

export * from "./CursorPagination";
export {
	type TableLinkComponent,
	type TableProps,
	useTableContext,
} from "./table-context";
export { TableProvider } from "./table-provider";
export { TableDropdownMenuCell } from "./table-dropdown-menu-cell";
export type { ColumnSkeletonMeta } from "./table-row-cells";
export * from "./table-skeleton-presets";
export { useCursorPagination } from "./useCursorPagination";
