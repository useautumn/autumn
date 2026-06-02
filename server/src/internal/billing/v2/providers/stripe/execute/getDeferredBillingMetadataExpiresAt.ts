import { ms } from "@autumn/shared";

export const getDeferredBillingMetadataExpiresAt = ({
	deferredInvoiceMode,
	paymentMethod,
	now = Date.now(),
}: {
	deferredInvoiceMode: boolean;
	paymentMethod?: { type?: string } | null;
	now?: number;
}) => {
	if (deferredInvoiceMode || paymentMethod?.type === "custom") {
		return null;
	}

	return now + ms.minutes(10);
};
