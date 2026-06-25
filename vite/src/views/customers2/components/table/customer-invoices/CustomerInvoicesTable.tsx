import type { Invoice } from "@autumn/shared";
import { Receipt } from "@phosphor-icons/react";
import { getPaginationRowModel } from "@tanstack/react-table";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { useInvoiceLineItemsQuery } from "@/views/customers2/hooks/useInvoiceLineItemsQuery";
import {
	getCustomerInvoicesColumns,
	hasNonStripeInvoice,
} from "./CustomerInvoicesColumns";
import { getInvoiceProductNames } from "./getInvoiceProductNames";

export function CustomerInvoicesTable() {
	const { customer, products, features, isLoading } = useCusQuery();
	const setSheet = useSheetStore((s) => s.setSheet);

	const invoiceIds = useMemo(
		() => customer?.invoices?.map((inv: Invoice) => inv.id) ?? [],
		[customer?.invoices],
	);

	const { lineItemsByInvoiceId, taxInfo } = useInvoiceLineItemsQuery({
		customerId: customer?.id || customer?.internal_id,
		invoiceIds,
		enabled: invoiceIds.length > 0,
	});

	const invoices = useMemo(
		() =>
			customer?.invoices.map((invoice: Invoice) => ({
				...invoice,
				productNames: getInvoiceProductNames({
					invoice,
					lineItems: lineItemsByInvoiceId[invoice.id] ?? [],
					products,
					features,
				}),
			})) ?? [],
		[customer?.invoices, products, features, lineItemsByInvoiceId],
	);

	const handleRowClick = (invoice: Invoice) => {
		const lineItems = lineItemsByInvoiceId[invoice.id] ?? [];
		const taxedAmount = taxInfo[invoice.id]?.taxed_amount;
		setSheet({
			type: "invoice-detail",
			data: {
				invoice,
				lineItems,
				taxedAmount,
			},
		});
	};

	const columns = useMemo(
		() =>
			getCustomerInvoicesColumns({
				showProcessor: hasNonStripeInvoice(invoices),
			}),
		[invoices],
	);

	const enableSorting = false;
	const table = useCustomerTable({
		data: invoices,
		columns,
		options: {
			getPaginationRowModel: getPaginationRowModel(),
			initialState: {
				pagination: {
					pageSize: 10,
				},
			},
		},
	});

	// const hasInvoices = invoices.length > 0;

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: columns.length,
				enableSorting,
				isLoading,
				onRowClick: handleRowClick,
				emptyStateText: "Invoices will display when a customer makes a payment",
				flexibleTableColumns: false,
				mobileCards: true,
				rowClassName: "h-10 py-0",
			}}
		>
			<Table.Container>
				<Table.Toolbar>
					<Table.Heading>
						<Receipt size={16} weight="fill" className="text-subtle" />
						Invoices
					</Table.Heading>
					{/* <Table.Actions>
						<CustomerInvoicesShowAllButton />
					</Table.Actions> */}
				</Table.Toolbar>
				{/* {hasInvoices ? ( */}

				<Table.Content>
					<Table.Header />
					<Table.Body />
				</Table.Content>
				{/* <Table.Pagination /> */}

				{/* ) : (
					!isLoading && (
						<EmptyState text="Invoices will display when a customer makes a payment" />
					)
				)} */}
			</Table.Container>
		</Table.Provider>
	);
}
