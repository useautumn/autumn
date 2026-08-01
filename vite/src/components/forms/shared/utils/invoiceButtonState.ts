const ZERO_AMOUNT_REASON =
	"Cannot send an invoice for $0 amounts. Please confirm the change instead.";

type InvoicePreview = {
	total: number;
	subtotal?: number | null;
	invoice_credits?: { balance?: number | null } | null;
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

	// Trials and credit-covered charges still create a $0 invoice, so keep the
	// invoice sheet for those; only bypass it when no invoice is created at all.
	const willCreateZeroDollarInvoice =
		(preview?.subtotal ?? 0) > 0 ||
		(preview?.invoice_credits?.balance ?? 0) > 0 ||
		trialEnabled;

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
