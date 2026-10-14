import {
	type ColumnDef,
	getCoreRowModel,
	getFilteredRowModel,
	useReactTable,
} from "@tanstack/react-table";

export function useAdminTable<TData>({
	data,
	columns,
}: {
	data: TData[];
	columns: ColumnDef<TData, unknown>[];
}) {
	return useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		enableSorting: false,
		enableGlobalFilter: true,
		globalFilterFn: "includesString",
	});
}
