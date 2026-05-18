import {
	type ColumnDef,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import type { IRow } from "../components/analytics-types";

export function useEventsTable({
	data,
	columns,
	pageSize = 500,
}: {
	data: IRow[];
	columns: ColumnDef<IRow, unknown>[];
	pageSize?: number;
}) {
	return useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		enableSorting: true,
		getRowId: (_row, index) => String(index),
		initialState: {
			pagination: { pageSize, pageIndex: 0 },
		},
	});
}
