import type { Price, Product } from "@autumn/shared";
import type Stripe from "stripe";
import { subscriptionItemMatchesAutumnPrice } from "../matchUtils/subscriptionItemMatchesAutumnPrice.js";

export const findAutumnPriceForSubscriptionItem = ({
	stripeSubscriptionItem,
	prices,
	product,
}: {
	stripeSubscriptionItem: Stripe.SubscriptionItem;
	prices: Array<Price & { product?: Product }>;
	product?: Product;
}) => {
	for (const price of prices) {
		const autumnProduct = price.product ?? product;
		if (!autumnProduct) continue;

		if (
			subscriptionItemMatchesAutumnPrice({
				stripeSubscriptionItem,
				price,
				product: autumnProduct,
			})
		) {
			return price;
		}
	}

	return undefined;
};
