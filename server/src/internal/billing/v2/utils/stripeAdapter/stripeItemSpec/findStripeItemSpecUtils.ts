import type { StripeItemSpec } from "@shared/models/billingModels/stripeAdapterModels/stripeItemSpec";

export const findStripeItemSpecByStripePriceId = ({
	stripePriceId,
	stripeItemSpecs,
}: {
	stripePriceId: string;
	stripeItemSpecs: StripeItemSpec[];
}) => {
	return stripeItemSpecs.find((item) => item.stripePriceId === stripePriceId);
};
