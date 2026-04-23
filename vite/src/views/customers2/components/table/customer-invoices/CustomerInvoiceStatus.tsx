import { InvoiceStatus } from "@autumn/shared";

const statusConfig = {
	[InvoiceStatus.Draft]: {
		color: "bg-gray-400 dark:bg-gray-600",
		label: "Draft",
	},
	[InvoiceStatus.Open]: {
		color: "bg-orange-500 dark:bg-orange-600",
		label: "Open",
	},
	[InvoiceStatus.Void]: {
		color: "bg-red-500 dark:bg-red-600",
		label: "Voided",
	},
	[InvoiceStatus.Paid]: {
		color: "bg-green-500 dark:bg-green-600",
		label: "Paid",
	},
	[InvoiceStatus.Uncollectible]: {
		color: "bg-gray-500 dark:bg-gray-600",
		label: "Uncollectible",
	},
};

const getRefundStatus = ({
	refundableAmount,
	refundedAmount,
}: {
	refundableAmount: number;
	refundedAmount: number;
}): { color: string; label: string } | null => {
	if (refundedAmount <= 0) return null;
	if (refundedAmount >= refundableAmount) {
		return {
			color: "bg-amber-500 dark:bg-amber-600",
			label: "Fully Refunded",
		};
	}
	return {
		color: "bg-amber-400 dark:bg-amber-500",
		label: "Partially Refunded",
	};
};

export function CustomerInvoiceStatus({
	status,
	total,
	amountPaid,
	refundedAmount,
}: {
	status: InvoiceStatus | null | undefined;
	total?: number;
	amountPaid?: number | null;
	refundedAmount?: number;
}) {
	if (!status) return null;

	// Check for refund status first (only for paid invoices)
	const refundStatus =
		status === InvoiceStatus.Paid &&
		total !== undefined &&
		refundedAmount !== undefined
			? getRefundStatus({
					refundableAmount: Math.abs(amountPaid ?? total),
					refundedAmount,
				})
			: null;

	const config = refundStatus ?? statusConfig[status];
	if (!config) return <div>{status}</div>;

	return (
		<div className="flex items-center gap-1">
			<div className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
			<span>{config.label}</span>
		</div>
	);
}
