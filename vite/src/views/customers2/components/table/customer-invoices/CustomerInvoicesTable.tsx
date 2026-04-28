import type { Invoice } from "@autumn/shared";
import { Receipt } from "@phosphor-icons/react";
import { getPaginationRowModel } from "@tanstack/react-table";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { useInvoiceLineItemsQuery } from "@/views/customers2/hooks/useInvoiceLineItemsQuery";
import { CustomerInvoicesColumns } from "./CustomerInvoicesColumns";
import { SyncInvoiceDialog } from "./SyncInvoiceDialog";

export function CustomerInvoicesTable() {
	const { customer, products, isLoading } = useCusQuery();
	const setSheet = useSheetStore((s) => s.setSheet);

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

	// Fetch line items for all invoices
	const invoiceIds = useMemo(
		() => customer?.invoices?.map((inv: Invoice) => inv.id) ?? [],
		[customer?.invoices],
	);

	const { lineItemsByInvoiceId } = useInvoiceLineItemsQuery({
		customerId: customer?.id || customer?.internal_id,
		invoiceIds,
		enabled: invoiceIds.length > 0,
	});

	const handleRowClick = (invoice: Invoice) => {
		const lineItems = lineItemsByInvoiceId[invoice.id] ?? [];
		setSheet({
			type: "invoice-detail",
			data: {
				invoice,
				lineItems,
			},
		});
	};

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
				onRowClick: handleRowClick,
				emptyStateText: "Invoices will display when a customer makes a payment",
				flexibleTableColumns: true,
			}}
		>
			<Table.Container>
				<Table.Toolbar>
					<Table.Heading>
						<Receipt size={16} weight="fill" className="text-subtle" />
						Invoices
					</Table.Heading>
					{isAdmin && (
						<Table.Actions>
							<SyncInvoiceDialog products={products ?? []} />
						</Table.Actions>
					)}
				</Table.Toolbar>
				<Table.Content>
					<Table.Header />
					<Table.Body />
				</Table.Content>
			</Table.Container>
		</Table.Provider>
	);
}
