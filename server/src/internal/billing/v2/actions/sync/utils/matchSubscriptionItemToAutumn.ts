import type { Price, Product } from "@autumn/shared";
import type Stripe from "stripe";

export enum SyncMatchPriority {
	NoMatch = 0,
	StripePriceId = 1,
	StripeProductId = 2,
	ProductProcessor = 3,
}

export type SyncMatchMethod =
	| "stripe_price_id"
	| "stripe_product_id"
	| "product_processor";

export type SyncMatchResult = {
	priority: SyncMatchPriority;
	matchMethod: SyncMatchMethod | null;
	product: Product | null;
	price: (Price & { product: Product }) | null;
};

/**
 * Matches a Stripe subscription item to an Autumn price/product using a
 * priority-based fallback chain (mirrors LineItemMatchPriority pattern).
 *
 * Priority 1: stripe_price_id on price config
 * Priority 2: stripe_product_id on price config (usage/prepaid)
 * Priority 3: product.processor.id on the main product
 */
export const matchSubscriptionItemToAutumn = ({
	stripeItem,
	priceByStripePriceId,
	priceByStripeProductId,
	productByStripeProductId,
}: {
	stripeItem: Stripe.SubscriptionItem;
	priceByStripePriceId: Record<string, Price & { product: Product }>;
	priceByStripeProductId: Record<string, Price & { product: Product }>;
	productByStripeProductId: Record<string, Product>;
}): SyncMatchResult => {
	const stripePriceId = stripeItem.price?.id;
	const stripeProductId =
		typeof stripeItem.price?.product === "string"
			? stripeItem.price.product
			: ((stripeItem.price?.product as Stripe.Product | undefined)?.id ?? null);

	// Priority 1: Match by Stripe price ID
	if (stripePriceId) {
		const matched = priceByStripePriceId[stripePriceId];
		if (matched) {
			return {
				priority: SyncMatchPriority.StripePriceId,
				matchMethod: "stripe_price_id",
				product: matched.product,
				price: matched,
			};
		}
	}

	// Priority 2: Match by Stripe product ID on price config (usage/prepaid)
	if (stripeProductId) {
		const matched = priceByStripeProductId[stripeProductId];
		if (matched) {
			return {
				priority: SyncMatchPriority.StripeProductId,
				matchMethod: "stripe_product_id",
				product: matched.product,
				price: matched,
			};
		}
	}

	// Priority 3: Match by product.processor.id
	if (stripeProductId) {
		const matched = productByStripeProductId[stripeProductId];
		if (matched) {
			return {
				priority: SyncMatchPriority.ProductProcessor,
				matchMethod: "product_processor",
				product: matched,
				price: null,
			};
		}
	}

	return {
		priority: SyncMatchPriority.NoMatch,
		matchMethod: null,
		product: null,
		price: null,
	};
};
