import type Stripe from "stripe";

export const createMockStripeSubscriptionItem = ({
	id,
	priceId,
	quantity,
}: {
	id: string;
	priceId: string;
	quantity: number;
}): Stripe.SubscriptionItem =>
	({
		id,
		object: "subscription_item",
		created: Math.floor(Date.now() / 1000),
		quantity,
		price: {
			id: priceId,
			object: "price",
			active: true,
			currency: "usd",
			type: "recurring",
		} as Stripe.Price,
	}) as Stripe.SubscriptionItem;

export const createMockStripeSubscription = ({
	id,
	items = [],
}: {
	id: string;
	items?: { id: string; priceId: string; quantity: number }[];
}): Stripe.Subscription => {
	const subscriptionItems = items.map((item) =>
		createMockStripeSubscriptionItem({
			id: item.id,
			priceId: item.priceId,
			quantity: item.quantity,
		}),
	);

	return {
		id,
		object: "subscription",
		status: "active",
		items: {
			object: "list",
			data: subscriptionItems,
			has_more: false,
			url: `/v1/subscription_items?subscription=${id}`,
		},
	} as Stripe.Subscription;
};
