import type { StripeDiscountWithCoupon } from "@autumn/shared";
import type Stripe from "stripe";

const createItem = ({
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

const create = ({
	id,
	items = [],
	discounts = [],
}: {
	id: string;
	items?: { id: string; priceId: string; quantity: number }[];
	discounts?: (Stripe.Discount | string | StripeDiscountWithCoupon)[];
}): Stripe.Subscription => {
	const subscriptionItems = items.map((item) =>
		createItem({
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
		discounts,
	} as Stripe.Subscription;
};

export const stripeSubscriptions = {
	create,
	createItem,
} as const;
