import { InternalError, type Price, type Product } from "@autumn/shared";
import type Stripe from "stripe";
import { subscriptionItemMatchesAutumnPrice } from "../matchUtils/subscriptionItemMatchesAutumnPrice";

export function findSubscriptionItemForAutumnPrice({
	price,
	product,
	stripeSubscriptionItems,
	errorOnNotFound,
}: {
	price: Price;
	product: Product;
	stripeSubscriptionItems: Stripe.SubscriptionItem[];
	errorOnNotFound: true;
}): Stripe.SubscriptionItem;

export function findSubscriptionItemForAutumnPrice({
	price,
	product,
	stripeSubscriptionItems,
	errorOnNotFound,
}: {
	price: Price;
	product: Product;
	stripeSubscriptionItems: Stripe.SubscriptionItem[];
	errorOnNotFound?: false;
}): Stripe.SubscriptionItem | undefined;

export function findSubscriptionItemForAutumnPrice({
	price,
	product,
	stripeSubscriptionItems,
	errorOnNotFound,
}: {
	price: Price;
	product: Product;
	stripeSubscriptionItems: Stripe.SubscriptionItem[];
	errorOnNotFound?: boolean;
}): Stripe.SubscriptionItem | undefined {
	const subscriptionItem = stripeSubscriptionItems.find(
		(stripeSubscriptionItem) =>
			subscriptionItemMatchesAutumnPrice({
				stripeSubscriptionItem,
				price,
				product,
			}),
	);

	if (errorOnNotFound && !subscriptionItem) {
		throw new InternalError({
			message: `Stripe subscription item not found for price: ${price.id}`,
		});
	}

	return subscriptionItem;
}
