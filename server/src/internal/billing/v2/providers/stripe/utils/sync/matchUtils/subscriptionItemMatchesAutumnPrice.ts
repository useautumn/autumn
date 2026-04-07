import type { Price, Product } from "@autumn/shared";
import type Stripe from "stripe";
import { normalizeStripeSubscriptionItem } from "../normalizeStripeObject";
import { stripePriceIdMatchesAutumnPrice } from "./stripePriceIdMatchesAutumnPrice";
import { stripeProductIdMatchesAutumnPrice } from "./stripeProductIdMatchesAutumnPrice";

export const subscriptionItemMatchesAutumnPrice = ({
	stripeSubscriptionItem,
	price,
	product,
}: {
	stripeSubscriptionItem: Stripe.SubscriptionItem;
	price: Price;
	product: Product;
}): boolean => {
	const candidate = normalizeStripeSubscriptionItem({
		stripeItem: stripeSubscriptionItem,
	});

	return (
		stripePriceIdMatchesAutumnPrice({
			candidate,
			price,
		}) ||
		stripeProductIdMatchesAutumnPrice({
			candidate,
			price,
			product,
		})
	);
};
