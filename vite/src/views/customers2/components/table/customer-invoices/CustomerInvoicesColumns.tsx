import type { Invoice, InvoiceDiscount } from "@autumn/shared";
import type { Row } from "@tanstack/react-table";
import { createDateTimeColumn } from "@/views/customers2/utils/ColumnHelpers";
import { CustomerInvoiceStatus } from "./CustomerInvoiceStatus";

type CustomerInvoice = Invoice & { productNames: string };

const getTotalDiscountAmount = (invoice: Invoice) => {
	return invoice.discounts.reduce((acc: number, discount: InvoiceDiscount) => {
		return acc + discount.amount_used;
	}, 0);
};

export const CustomerInvoicesColumns = [
	{
		header: "Products",
		accessorKey: "productNames",
		cell: ({ row }: { row: Row<CustomerInvoice> }) => {
			return <div>{row.original.productNames}</div>;
		},
	},
	{
		header: "Total",
		accessorKey: "total",
		cell: ({ row }: { row: Row<CustomerInvoice> }) => {
			const invoice = row.original;
			const discountAmount = getTotalDiscountAmount(invoice);
			return (
				<div>
					{invoice.total.toFixed(2)} {invoice.currency.toUpperCase()}
					{discountAmount > 0 && (
						<span className="text-t3"> (-{discountAmount.toFixed(2)})</span>
					)}
				</div>
			);
		},
	},
	{
		header: "Status",
		accessorKey: "status",
		cell: ({ row }: { row: Row<CustomerInvoice> }) => {
			return <CustomerInvoiceStatus status={row.original.status} />;
		},
	},
	createDateTimeColumn<CustomerInvoice>({
		header: "Created At",
		accessorKey: "created_at",
	}),
];
