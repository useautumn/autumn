import type { Invoice } from "@autumn/shared";
import { Receipt } from "@phosphor-icons/react";
import { getPaginationRowModel } from "@tanstack/react-table";
import { useMemo } from "react";
import { toast } from "sonner";
import { Table } from "@/components/general/table";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { CustomerInvoicesColumns } from "./CustomerInvoicesColumns";

export function CustomerInvoicesTable() {
	const { customer, products, isLoading } = useCusQuery();
	const { stripeAccount } = useOrgStripeQuery();
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

	const handleRowClick = async (invoice: Invoice) => {
		const stripeInvoice = await getStripeInvoice(invoice.stripe_id);
		if (!stripeInvoice) return;

		if (stripeInvoice.hosted_invoice_url) {
			window.open(stripeInvoice.hosted_invoice_url, "_blank");
		} else {
			window.open(
				getStripeInvoiceLink({
					stripeInvoice,
					env,
					accountId: stripeAccount?.id,
				}),
				"_blank",
			);
		}
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

	const hasInvoices = invoices.length > 0;

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: CustomerInvoicesColumns.length,
				enableSorting,
				isLoading,
				onRowClick: handleRowClick,
				// rowClassName: "h-14 py-4 cursor-pointer",
			}}
		>
			<Table.Container>
				<Table.Toolbar>
					<Table.Heading>
						<Receipt size={16} weight="fill" className="text-t5" />
						Invoices
					</Table.Heading>
					{/* <Table.Actions>
						<CustomerInvoicesShowAllButton />
					</Table.Actions> */}
				</Table.Toolbar>
				{hasInvoices ? (
					<>
						<Table.Content>
							<Table.Header />
							<Table.Body />
						</Table.Content>
						{/* <Table.Pagination /> */}
					</>
				) : (
					!isLoading && (
						<div className="flex justify-center items-center py-4">
							<p className="text-sm text-t4">
								Invoices will display when a customer makes a payment
							</p>
						</div>
					)
				)}
			</Table.Container>
		</Table.Provider>
	);
}
