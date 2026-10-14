import { PAST_START_REQUIRES_INVOICE } from "@autumn/shared";

const ZERO_AMOUNT_REASON =
	"Cannot send an invoice for $0 amounts. Please confirm the change instead.";

export const shouldDisableInvoiceButton = ({
	isPending,
	previewError,
}: {
	isPending: boolean;
	previewError?: string;
}) =>
	isPending || (!!previewError && previewError !== PAST_START_REQUIRES_INVOICE);

type InvoicePreview = {
	total: number;
	subtotal?: number | null;
} | null;

export function getInvoiceButtonState({
	preview,
	previewFailed = false,
	createsRecurringSubscription,
	trialEnabled = false,
}: {
	preview: InvoicePreview | undefined;
	previewFailed?: boolean;
	createsRecurringSubscription: boolean;
	trialEnabled?: boolean;
}) {
	if (previewFailed) preview = undefined;

	const hasNothingToInvoice =
		!!preview && preview.total <= 0 && !createsRecurringSubscription;

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
