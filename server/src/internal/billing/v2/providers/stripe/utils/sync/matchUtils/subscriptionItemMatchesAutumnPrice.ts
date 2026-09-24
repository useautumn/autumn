import type { Price, Product } from "@autumn/shared";
import type Stripe from "stripe";
import { normalizeStripeSubscriptionItem } from "../normalizeStripeObject.js";
import { stripeCandidateMatchesAutumnPrice } from "./stripeCandidateMatchesAutumnPrice.js";

export const subscriptionItemMatchesAutumnPrice = ({
	stripeSubscriptionItem,
	price,
	product,
}: {
	stripeSubscriptionItem: Stripe.SubscriptionItem;
	price: Price;
	product: Product;
}): boolean =>
	stripeCandidateMatchesAutumnPrice({
		candidate: normalizeStripeSubscriptionItem({
			stripeItem: stripeSubscriptionItem,
		}),
		stripePrice: stripeSubscriptionItem.price,
		price,
		product,
	});
