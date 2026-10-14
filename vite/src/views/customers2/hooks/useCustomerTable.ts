import {
	type ColumnDef,
	getCoreRowModel,
	getFilteredRowModel,
	type TableOptions,
	useReactTable,
} from "@tanstack/react-table";

export function useCustomerTable<
	TData extends { id?: string | null; internal_id?: string },
>({
	data,
	columns,
	options = {},
}: {
	data: TData[];
	columns: ColumnDef<TData, unknown>[];
	options?: Partial<TableOptions<TData>>;
}) {
	const enableSorting = false;

	return useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		enableSorting,
		getRowId: (row) => row.id || row.internal_id || crypto.randomUUID(),
		...options,
	});
}
