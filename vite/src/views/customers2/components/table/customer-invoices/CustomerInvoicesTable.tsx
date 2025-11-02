import type { Invoice } from "@autumn/shared";
import { getPaginationRowModel } from "@tanstack/react-table";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { CustomerInvoicesColumns } from "./CustomerInvoicesColumns";
import { CustomerInvoicesShowAllButton } from "./CustomerInvoicesShowAllButton";

export function CustomerInvoicesTable() {
	const { customer, products, isLoading } = useCusQuery();

	const invoices = useMemo(
		() =>
			customer?.invoices.map((invoice: Invoice) => ({
				...invoice,
				productNames: invoice.product_ids
					.map(
						(id: string) =>
							products?.find((p: { id: string; name: string }) => p.id === id)
								?.name,
					)
					.filter(Boolean)
					.join(", "),
			})) ?? [],
		[customer?.invoices, products],
	);

	const enableSorting = false;
	const table = useCustomerTable({
		data: invoices,
		columns: CustomerInvoicesColumns,
		options: {
			getPaginationRowModel: getPaginationRowModel(),
			initialState: {
				pagination: {
					pageSize: 10,
				},
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
					<Table.Actions>
						<CustomerInvoicesShowAllButton />
					</Table.Actions>
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
