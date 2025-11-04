import type { Invoice } from "@autumn/shared";
import type { Row } from "@tanstack/react-table";
import { createDateTimeColumn } from "@/views/customers2/utils/ColumnHelpers";
import { CustomerInvoiceStatus } from "./CustomerInvoiceStatus";

type CustomerInvoice = Invoice & { productNames: string };

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
			return (
				<div>
					{invoice.total.toFixed(2)} {invoice.currency.toUpperCase()}
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
