const PAST_START_REQUIRES_INVOICE =
	"Past starts_at cannot be used when Stripe Checkout is required.";

export const shouldDisableAttachInvoiceButton = ({
	isPending,
	previewError,
}: {
	isPending: boolean;
	previewError?: string;
}) =>
	isPending ||
	(!!previewError && previewError !== PAST_START_REQUIRES_INVOICE);
