import type React from "react";

/**
 * Column definition for DataTable
 */
export interface Column<T> {
	/** Unique key for this column */
	key: string;
	/** Header text to display */
	header: string;
	/** Render function for cell content */
	render: (item: T, isSelected: boolean) => React.ReactNode;
	/** Optional: minimum width for this column */
	minWidth?: number;
}

// Components
export { DataTable } from "./DataTable.js";
export type { DataTableProps } from "./DataTable.js";

export { TableRow, TableHeader } from "./TableRow.js";
export type { TableRowProps, TableHeaderProps } from "./TableRow.js";
