export const normalizeFeatureStripeProductId = (
	stripeProductId?: string | null,
) => stripeProductId?.trim() || null;

export const featureStripeProductChanged = ({
	from,
	to,
}: {
	from?: string | null;
	to?: string | null;
}) =>
	normalizeFeatureStripeProductId(from) !==
	normalizeFeatureStripeProductId(to);
