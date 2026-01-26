import type Stripe from "stripe";

export const shouldCancelSub = ({
	sub,
	newSubItems,
}: {
	sub: Stripe.Subscription;
	newSubItems: Stripe.SubscriptionUpdateParams.Item[];
}) => {
	for (const item of sub.items.data) {
		const isDeleted = newSubItems.some((i) => i.id == item.id && i.deleted);
		if (!isDeleted) return false;
	}

	return sub.items.data.length == newSubItems.length;
};
