export const getPreviewCreditAmount = ({
	previewData,
	includeScheduledFallback = false,
}: {
	previewData?: {
		line_items?: { amount: number }[];
		total?: number;
		incoming?: {
			plan: { price?: { amount?: number | null } | null };
		}[];
		outgoing?: {
			plan: { price?: { amount?: number | null } | null };
		}[];
	} | null;
	includeScheduledFallback?: boolean;
}) => {
	const lineItems = previewData?.line_items ?? [];

	const immediateCreditAmount = Math.max(
		0,
		-lineItems.reduce((total, lineItem) => total + lineItem.amount, 0),
	);

	if (!includeScheduledFallback || immediateCreditAmount > 0 || !previewData) {
		return immediateCreditAmount;
	}

	const shouldUseScheduledFallback =
		lineItems.length === 0 && (previewData.total ?? 0) === 0;

	if (!shouldUseScheduledFallback) {
		return immediateCreditAmount;
	}

	const outgoingTotal = (previewData.outgoing ?? []).reduce(
		(total, change) => total + (change.plan.price?.amount ?? 0),
		0,
	);
	const incomingTotal = (previewData.incoming ?? []).reduce(
		(total, change) => total + (change.plan.price?.amount ?? 0),
		0,
	);

	return Math.max(0, outgoingTotal - incomingTotal);
};
