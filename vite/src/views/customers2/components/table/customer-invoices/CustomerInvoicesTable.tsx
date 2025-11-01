import {
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { CustomerInvoicesColumns } from "./CustomerInvoicesColumns";

export function CustomerInvoicesTable() {
	const { customer, products, isLoading } = useCusQuery();

	const invoices = useMemo(
		() =>
			customer?.invoices.map((invoice: any) => ({
				...invoice,
				productNames: invoice.product_ids
					.map((id: string) => products?.find((p: any) => p.id === id)?.name)
					.filter(Boolean)
					.join(", "),
			})) ?? [],
		[customer?.invoices, products],
	);

	const enableSorting = false;
	const table = useReactTable({
		data: invoices,
		columns: CustomerInvoicesColumns,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		enableSorting,
		initialState: {
			pagination: {
				pageSize: 10,
			},
		},
	});

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: CustomerInvoicesColumns.length,
				enableSorting,
				isLoading,
			}}
		>
			<Table.Container>
				<Table.Toolbar>
					<Table.Heading>Invoices</Table.Heading>
				</Table.Toolbar>
				<Table.Content>
					<Table.Header />
					<Table.Body />
				</Table.Content>
				<Table.Pagination />
			</Table.Container>
		</Table.Provider>
	);
}
