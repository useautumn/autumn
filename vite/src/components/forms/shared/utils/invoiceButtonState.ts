const ZERO_AMOUNT_REASON =
	"Cannot send an invoice for $0 amounts. Please confirm the change instead.";

type InvoicePreview = {
	total: number;
	subtotal?: number | null;
} | null;

/**
 * Decides whether the invoice button starts the subscription directly (no
 * invoice is created at all) or opens the send-invoice sheet.
 */
export function getInvoiceButtonState({
	preview,
	createsRecurringSubscription,
	trialEnabled = false,
}: {
	preview: InvoicePreview | undefined;
	createsRecurringSubscription: boolean;
	trialEnabled?: boolean;
}) {
	const hasNothingToInvoice =
		!!preview && preview.total <= 0 && !createsRecurringSubscription;

	// Trials and charges zeroed out by credits or discounts still create a $0
	// invoice; only bypass the sheet when nothing was billed in the first place.
	const willCreateZeroDollarInvoice =
		(preview?.subtotal ?? 0) > 0 || trialEnabled;

	const isInvoiceOnlyStart =
		!!preview &&
		preview.total <= 0 &&
		createsRecurringSubscription &&
		!willCreateZeroDollarInvoice;

	return {
		isInvoiceOnlyStart,
		hasNothingToInvoice,
		label: isInvoiceOnlyStart
			? "Start subscription in invoice mode"
			: "Send an Invoice",
		zeroAmountReason: hasNothingToInvoice ? ZERO_AMOUNT_REASON : null,
	};
}
