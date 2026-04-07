import type { FullProduct } from "@autumn/shared";
import type Stripe from "stripe";
import { subscriptionItemMatchesAutumnProduct } from "../matchUtils/subscriptionItemMatchesAutumnProduct";
import { findAutumnPriceForSubscriptionItem } from "./findAutumnPriceForSubscriptionItem";

export const findAutumnProductForSubscription = ({
	stripeSubscription,
	products,
}: {
	stripeSubscription: Stripe.Subscription;
	products: FullProduct[];
}) => {
	const matchedProducts = new Set<string>();
	let matchedAutumnProduct: FullProduct | undefined;

	for (const stripeSubscriptionItem of stripeSubscription.items.data) {
		for (const product of products) {
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

			matchedProducts.add(product.id);
			matchedAutumnProduct = product;
		}
	}

	if (matchedProducts.size !== 1) return undefined;

	return matchedAutumnProduct;
};
