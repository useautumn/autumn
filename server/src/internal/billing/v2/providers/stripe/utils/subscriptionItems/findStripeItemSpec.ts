import type { StripeItemSpec } from "@autumn/shared";

export const findStripeItemSpecByStripePriceId = ({
	stripePriceId,
	stripeItemSpecs,
}: {
	stripePriceId: string;
	stripeItemSpecs: StripeItemSpec[];
}) => {
	return stripeItemSpecs.find((item) => item.stripePriceId === stripePriceId);
};
