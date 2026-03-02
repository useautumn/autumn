import type { Invoice } from "@autumn/shared";
import { Receipt } from "@phosphor-icons/react";
import { getPaginationRowModel } from "@tanstack/react-table";
import { useMemo } from "react";
import { toast } from "sonner";
import { Table } from "@/components/general/table";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { useInvoiceLineItemsQuery } from "@/views/customers2/hooks/useInvoiceLineItemsQuery";
import { CustomerInvoicesColumns } from "./CustomerInvoicesColumns";

export function CustomerInvoicesTable() {
	const { customer, products, isLoading } = useCusQuery();
	const { stripeAccount } = useOrgStripeQuery();
	const { isAdmin } = useAdmin();
	const setSheet = useSheetStore((s) => s.setSheet);
	const axiosInstance = useAxiosInstance();
	const env = useEnv();

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

	// Fetch line items for all invoices (admin only)
	const invoiceIds = useMemo(
		() => customer?.invoices?.map((inv: Invoice) => inv.id) ?? [],
		[customer?.invoices],
	);

	const { lineItemsByInvoiceId } = useInvoiceLineItemsQuery({
		invoiceIds,
		enabled: isAdmin && invoiceIds.length > 0,
	});

	const getStripeInvoice = async (stripeInvoiceId: string) => {
		try {
			const { data } = await axiosInstance.get(
				`/v1/invoices/${stripeInvoiceId}/stripe`,
			);
			return data;
		} catch {
			toast.error("Failed to get invoice URL");
			return null;
		}
	};

	const openInvoiceUrl = async (invoice: Invoice) => {
		// Fast path: use stored hosted_invoice_url if available
		if (invoice.hosted_invoice_url) {
			window.open(invoice.hosted_invoice_url, "_blank");
			return;
		}

		// Fallback: fetch from Stripe for draft invoices
		const stripeInvoice = await getStripeInvoice(invoice.stripe_id);
		if (!stripeInvoice) return;

		window.open(
			getStripeInvoiceLink({
				stripeInvoice,
				env,
				accountId: stripeAccount?.id,
			}),
			"_blank",
		);
	};

	const handleRowClick = async (invoice: Invoice) => {
		const lineItems = lineItemsByInvoiceId[invoice.id] ?? [];

		// For admins with line items, open the detail sheet
		if (isAdmin && lineItems.length > 0) {
			setSheet({
				type: "invoice-detail",
				data: {
					invoice,
					lineItems,
				},
			});
			return;
		}

		// For non-admin or invoices without line items, open invoice URL
		await openInvoiceUrl(invoice);
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

	// const hasInvoices = invoices.length > 0;

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: CustomerInvoicesColumns.length,
				enableSorting,
				isLoading,
				onRowClick: handleRowClick,
				onRowDoubleClick: openInvoiceUrl,
				emptyStateText: "Invoices will display when a customer makes a payment",
				flexibleTableColumns: true,
				// rowClassName: "h-14 py-4 cursor-pointer",
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
