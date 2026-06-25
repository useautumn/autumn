import {
	type Invoice,
	type InvoiceDiscount,
	ProcessorType,
} from "@autumn/shared";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@autumn/ui";
import type { Row } from "@tanstack/react-table";
import { AdminHover } from "@/components/general/AdminHover";
import { ProcessorIcon } from "@/components/v2/icons/ProcessorIcon";
import { getInvoiceHoverTexts } from "@/views/admin/adminUtils";
import { createDateTimeColumn } from "@/views/customers2/utils/ColumnHelpers";
import { CustomerInvoiceStatus } from "./CustomerInvoiceStatus";

type CustomerInvoice = Invoice & { productNames: string };

const getTotalDiscountAmount = (invoice: Invoice) => {
	return invoice.discounts.reduce((acc: number, discount: InvoiceDiscount) => {
		return acc + discount.amount_used;
	}, 0);
};

const PROCESSOR_LABELS: Record<ProcessorType, string> = {
	[ProcessorType.Stripe]: "Stripe",
	[ProcessorType.RevenueCat]: "RevenueCat",
};

const processorColumn = {
	header: "Processor",
	accessorKey: "processor_type",
	size: 140,
	cell: ({ row }: { row: Row<CustomerInvoice> }) => {
		const processor = row.original.processor_type ?? ProcessorType.Stripe;
		return (
			<TooltipProvider>
				<Tooltip delayDuration={0}>
					<TooltipTrigger asChild>
						<span
							className="flex w-full min-w-0 items-center gap-1.5 text-muted-foreground"
							title={PROCESSOR_LABELS[processor]}
						>
							<ProcessorIcon processor={processor} />
							<span className="min-w-0 truncate text-sm">
								{PROCESSOR_LABELS[processor]}
							</span>
						</span>
					</TooltipTrigger>
					<TooltipContent>{PROCESSOR_LABELS[processor]}</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	},
};

export const hasNonStripeInvoice = (invoices: CustomerInvoice[]) =>
	invoices.some(
		(inv) =>
			inv.processor_type != null && inv.processor_type !== ProcessorType.Stripe,
	);

export const getCustomerInvoicesColumns = ({
	showProcessor,
}: {
	showProcessor: boolean;
}) => [
	...(showProcessor ? [processorColumn] : []),
	{
		header: "Products",
		accessorKey: "productNames",
		size: 360,
		cell: ({ row }: { row: Row<CustomerInvoice> }) => {
			return (
				<div className="min-w-0 max-w-full" title={row.original.productNames}>
					<AdminHover texts={getInvoiceHoverTexts({ invoice: row.original })}>
						<span className="block max-w-full truncate">
							{row.original.productNames}
						</span>
					</AdminHover>
				</div>
			);
		},
	},
	{
		header: "Total",
		accessorKey: "total",
		size: 120,
		cell: ({ row }: { row: Row<CustomerInvoice> }) => {
			const invoice = row.original;
			const discountAmount = getTotalDiscountAmount(invoice);
			return (
				<div>
					{invoice.total.toFixed(2)} {invoice.currency.toUpperCase()}
					{discountAmount > 0 && (
						<span className="text-tertiary-foreground">
							{" "}
							(-{discountAmount.toFixed(2)})
						</span>
					)}
				</div>
			);
		},
	},
	{
		header: "Status",
		accessorKey: "status",
		cell: ({ row }: { row: Row<CustomerInvoice> }) => {
			const invoice = row.original;
			return (
				<CustomerInvoiceStatus
					status={invoice.status}
					total={invoice.total}
					amountPaid={invoice.amount_paid}
					refundedAmount={invoice.refunded_amount}
				/>
			);
		},
	},
	createDateTimeColumn<CustomerInvoice>({
		header: "Created At",
		accessorKey: "created_at",
		withYear: true,
	}),
];
