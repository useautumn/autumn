import {
	type ColumnDef,
	getCoreRowModel,
	getExpandedRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	type TableOptions,
	useReactTable,
} from "@tanstack/react-table";

export function useProductTable<TData>({
	data,
	columns,
	options = {},
}: {
	data: TData[];
	columns: ColumnDef<TData, unknown>[];
	options?: Partial<TableOptions<TData>>;
}) {
	const enableSorting = options.enableSorting ?? false;

	return useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getExpandedRowModel: getExpandedRowModel(),
		...(enableSorting && { getSortedRowModel: getSortedRowModel() }),
		enableSorting,
		...options,
	});
}
