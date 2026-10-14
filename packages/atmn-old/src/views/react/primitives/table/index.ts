import type React from "react";

export interface Column<T> {
	key: string;
	header: string;
	render: (item: T, isSelected: boolean) => React.ReactNode;
	minWidth?: number;
}

export { DataTable } from "./DataTable.js";
export type { DataTableProps } from "./DataTable.js";

export { TableRow, TableHeader } from "./TableRow.js";
export type { TableRowProps, TableHeaderProps } from "./TableRow.js";
