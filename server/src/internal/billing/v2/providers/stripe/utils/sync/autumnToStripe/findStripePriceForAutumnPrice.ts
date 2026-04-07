import type { Price, Product } from "@autumn/shared";
import type Stripe from "stripe";
import { stripePriceIdMatchesAutumnPrice } from "../matchUtils/stripePriceIdMatchesAutumnPrice";
import { stripeProductIdMatchesAutumnPrice } from "../matchUtils/stripeProductIdMatchesAutumnPrice";
import { normalizeStripePrice } from "../normalizeStripeObject";

export const findStripePriceForAutumnPrice = ({
	autumnPrice,
	product,
	stripePrices,
}: {
	autumnPrice: Price;
	product: Product;
	stripePrices: Stripe.Price[];
}): Stripe.Price | undefined => {
	return stripePrices.find((stripePrice) => {
		const candidate = normalizeStripePrice({
			stripePrice,
		});

		return (
			stripePriceIdMatchesAutumnPrice({
				candidate,
				price: autumnPrice,
			}) ||
			stripeProductIdMatchesAutumnPrice({
				candidate,
				price: autumnPrice,
				product,
			})
		);
	});
};
