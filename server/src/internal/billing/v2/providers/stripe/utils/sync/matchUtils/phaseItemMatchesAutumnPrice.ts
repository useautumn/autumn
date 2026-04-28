import type { Price, Product } from "@autumn/shared";
import type Stripe from "stripe";
import { normalizeStripePhaseItem } from "../normalizeStripeObject.js";
import { stripePriceIdMatchesAutumnPrice } from "./stripePriceIdMatchesAutumnPrice.js";
import { stripeProductIdMatchesAutumnPrice } from "./stripeProductIdMatchesAutumnPrice.js";

export const phaseItemMatchesAutumnPrice = ({
	phaseItem,
	price,
	product,
}: {
	phaseItem: Stripe.SubscriptionSchedule.Phase.Item;
	price: Price;
	product: Product;
}): boolean => {
	const candidate = normalizeStripePhaseItem({
		phaseItem,
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
