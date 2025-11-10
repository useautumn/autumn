"use client";

import { TableActions } from "./table-actions";
import { TableBody } from "./table-body";
import { TableContainer } from "./table-container";
import { TableContent } from "./table-content";
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
	Header: TableHeader,
	Heading: TableHeading,
	Body: TableBody,
	Container: TableContainer,
	Pagination: TablePagination,
};
