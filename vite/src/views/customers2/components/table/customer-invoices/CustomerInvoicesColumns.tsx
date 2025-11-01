import type { Invoice } from "@autumn/shared";
import type { Row } from "@tanstack/react-table";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { CustomerInvoiceStatus } from "./CustomerInvoiceStatus";

export const CustomerInvoicesColumns = [
	{
		header: "Products",
		accessorKey: "productNames",
		cell: ({ row }: { row: Row<Invoice & { productNames: string }> }) => {
			return <div>{row.original.productNames}</div>;
		},
	},
	{
		header: "Total",
		accessorKey: "total",
		cell: ({ row }: { row: Row<Invoice> }) => {
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
		cell: ({ row }: { row: Row<Invoice> }) => {
			return <CustomerInvoiceStatus status={row.original.status} />;
		},
	},
	{
		header: "Created At",
		accessorKey: "created_at",
		cell: ({ row }: { row: Row<Invoice> }) => {
			const invoice = row.original;
			const { date, time } = formatUnixToDateTime(invoice.created_at);
			return (
				<div className="text-xs text-t3">
					{date} {time}
				</div>
			);
		},
	},
];
