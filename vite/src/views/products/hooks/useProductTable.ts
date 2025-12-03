import {
	type ColumnDef,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	type TableOptions,
	useReactTable,
} from "@tanstack/react-table";

/**
 * Custom hook for product tables with standardized configuration.
 * Provides consistent table setup across all product-related tables.
 */
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
		...(enableSorting && { getSortedRowModel: getSortedRowModel() }),
		enableSorting,
		...options,
	});
}

