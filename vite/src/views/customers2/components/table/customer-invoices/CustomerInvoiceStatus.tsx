import { InvoiceStatus } from "@autumn/shared";
import { StatusChip, type StatusGlyph, type StatusTone } from "@autumn/ui";

type InvoiceStatusDisplay = {
	label: string;
	tone: StatusTone;
	glyph: StatusGlyph;
};

const statusConfig: Record<InvoiceStatus, InvoiceStatusDisplay> = {
	[InvoiceStatus.Draft]: {
		label: "Draft",
		tone: "neutral",
		glyph: "pencil",
	},
	[InvoiceStatus.Open]: {
		label: "Open",
		tone: "orange",
		glyph: "clock",
	},
	[InvoiceStatus.Void]: {
		label: "Voided",
		tone: "red",
		glyph: "x",
	},
	[InvoiceStatus.Paid]: {
		label: "Paid",
		tone: "green",
		glyph: "check",
	},
	[InvoiceStatus.Uncollectible]: {
		label: "Uncollectible",
		tone: "neutral",
		glyph: "minus",
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
			label: "Fully Refunded",
			tone: "amber",
			glyph: "refresh",
		};
	}
	return {
		label: "Partially Refunded",
		tone: "amber",
		glyph: "refresh",
	};
};

/** An invoice preview has no InvoiceStatus — it isn't an invoice yet. */
export const UPCOMING_INVOICE_STATUS: InvoiceStatusDisplay = {
	label: "Upcoming",
	tone: "orange",
	glyph: "calendar",
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

	return (
		<StatusChip tone={config.tone} glyph={config.glyph}>
			{config.label}
		</StatusChip>
	);
}
