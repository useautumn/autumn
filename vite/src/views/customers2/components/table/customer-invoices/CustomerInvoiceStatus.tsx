import { InvoiceStatus } from "@autumn/shared";
import { StatusChip, StatusChipIcon } from "@autumn/ui";
import {
	ArrowCounterClockwiseIcon,
	CalendarBlankIcon,
	CheckIcon,
	ClockIcon,
	type Icon,
	MinusIcon,
	PencilSimpleIcon,
	XIcon,
} from "@phosphor-icons/react";

type InvoiceStatusDisplay = { color: string; label: string; icon: Icon };

const statusConfig: Record<InvoiceStatus, InvoiceStatusDisplay> = {
	[InvoiceStatus.Draft]: {
		color: "bg-zinc-400 dark:bg-zinc-600",
		label: "Draft",
		icon: PencilSimpleIcon,
	},
	[InvoiceStatus.Open]: {
		color: "bg-orange-500 dark:bg-orange-600",
		label: "Open",
		icon: ClockIcon,
	},
	[InvoiceStatus.Void]: {
		color: "bg-red-500 dark:bg-red-600",
		label: "Voided",
		icon: XIcon,
	},
	[InvoiceStatus.Paid]: {
		color: "bg-green-500 dark:bg-green-600",
		label: "Paid",
		icon: CheckIcon,
	},
	[InvoiceStatus.Uncollectible]: {
		color: "bg-zinc-400 dark:bg-zinc-500",
		label: "Uncollectible",
		icon: MinusIcon,
	},
};

const getRefundStatus = ({
	refundableAmount,
	refundedAmount,
}: {
	refundableAmount: number;
	refundedAmount: number;
}): InvoiceStatusDisplay | null => {
	if (refundedAmount <= 0) return null;
	if (refundedAmount >= refundableAmount) {
		return {
			color: "bg-amber-500 dark:bg-amber-600",
			label: "Fully Refunded",
			icon: ArrowCounterClockwiseIcon,
		};
	}
	return {
		color: "bg-amber-400 dark:bg-amber-500",
		label: "Partially Refunded",
		icon: ArrowCounterClockwiseIcon,
	};
};

/** An invoice preview has no InvoiceStatus — it isn't an invoice yet. */
export const UPCOMING_INVOICE_STATUS: InvoiceStatusDisplay = {
	color: "bg-orange-500 dark:bg-orange-600",
	label: "Upcoming",
	icon: CalendarBlankIcon,
};

export function CustomerInvoiceStatus({
	status,
	total,
	amountPaid,
	refundedAmount,
	override,
}: {
	status?: InvoiceStatus | null;
	total?: number;
	amountPaid?: number | null;
	refundedAmount?: number;
	override?: InvoiceStatusDisplay;
}) {
	if (!(override || status)) return null;

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

	const config =
		override ?? refundStatus ?? (status ? statusConfig[status] : undefined);
	if (!config) return <div>{status}</div>;

	const StatusIcon = config.icon;

	return (
		<StatusChip
			indicator={
				<StatusChipIcon
					icon={<StatusIcon weight="bold" />}
					className={config.color}
				/>
			}
		>
			{config.label}
		</StatusChip>
	);
}
