import type { Price, Product } from "@autumn/shared";
import type Stripe from "stripe";
import { stripePriceIdMatchesAutumnPrice } from "../matchUtils/stripePriceIdMatchesAutumnPrice.js";
import { stripeProductIdMatchesAutumnPrice } from "../matchUtils/stripeProductIdMatchesAutumnPrice.js";
import { normalizeStripePrice } from "../normalizeStripeObject.js";

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
