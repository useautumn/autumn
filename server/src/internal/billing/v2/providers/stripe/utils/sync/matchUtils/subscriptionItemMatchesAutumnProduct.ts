import type { Product } from "@autumn/shared";
import type Stripe from "stripe";
import { normalizeStripeSubscriptionItem } from "../normalizeStripeObject.js";
import { stripeProductIdMatchesAutumnProduct } from "./stripeProductIdMatchesAutumnProduct.js";

export const subscriptionItemMatchesAutumnProduct = ({
	stripeSubscriptionItem,
	product,
}: {
	stripeSubscriptionItem: Stripe.SubscriptionItem;
	product: Product;
}): boolean => {
	return stripeProductIdMatchesAutumnProduct({
		candidate: normalizeStripeSubscriptionItem({
			stripeItem: stripeSubscriptionItem,
		}),
		product,
	});
};
