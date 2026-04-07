import type { Price, Product } from "@autumn/shared";
import type Stripe from "stripe";
import { normalizeStripePhaseItem } from "../normalizeStripeObject";
import { stripePriceIdMatchesAutumnPrice } from "./stripePriceIdMatchesAutumnPrice";
import { stripeProductIdMatchesAutumnPrice } from "./stripeProductIdMatchesAutumnPrice";

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
