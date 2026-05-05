import type { FullProduct } from "@autumn/shared";
import type Stripe from "stripe";
import { subscriptionItemMatchesAutumnProduct } from "../matchUtils/subscriptionItemMatchesAutumnProduct.js";
import { findAutumnPriceForSubscriptionItem } from "./findAutumnPriceForSubscriptionItem.js";

export const findAutumnProductsForSubscription = ({
	stripeSubscription,
	products,
}: {
	stripeSubscription: Stripe.Subscription;
	products: FullProduct[];
}): FullProduct[] => {
	const matchedById = new Map<string, FullProduct>();

	for (const stripeSubscriptionItem of stripeSubscription.items.data) {
		for (const product of products) {
			if (matchedById.has(product.id)) continue;

			const matchedPrice = findAutumnPriceForSubscriptionItem({
				stripeSubscriptionItem,
				prices: product.prices.map((price) => ({
					...price,
					product,
				})),
				product,
			});

			const productMatchedDirectly = subscriptionItemMatchesAutumnProduct({
				stripeSubscriptionItem,
				product,
			});

			if (!matchedPrice && !productMatchedDirectly) continue;

			matchedById.set(product.id, product);
		}
	}

	return Array.from(matchedById.values());
};
