import type Stripe from "stripe";
import type { StripeItemSnapshot, StripeItemTier } from "./types";

const resolveStripeProductId = ({
	product,
}: {
	product: string | Stripe.Product | Stripe.DeletedProduct | null | undefined;
}): string | null => {
	if (!product) return null;
	return typeof product === "string" ? product : (product.id ?? null);
};

const extractTiers = ({
	price,
}: {
	price: Stripe.Price;
}): StripeItemTier[] | null => {
	if (!price.tiers) return null;
	return price.tiers.map((tier) => ({
		up_to: tier.up_to,
		unit_amount: tier.unit_amount,
		flat_amount: tier.flat_amount,
	}));
};

/**
 * Normalize a Stripe.SubscriptionItem to the canonical StripeItemSnapshot
 * shape consumed by sync detection. Returns null for degenerate items
 * (missing price or product) so the caller can filter them out.
 */
export const normalizeSubscriptionItem = ({
	stripeItem,
}: {
	stripeItem: Stripe.SubscriptionItem;
}): StripeItemSnapshot | null => {
	const price = stripeItem.price;
	if (!price) return null;

	const stripePriceId = price.id;
	const stripeProductId = resolveStripeProductId({ product: price.product });
	if (!stripePriceId || !stripeProductId) return null;

	return {
		id: stripeItem.id,
		stripe_price_id: stripePriceId,
		stripe_product_id: stripeProductId,
		unit_amount: price.unit_amount ?? null,
		currency: price.currency ?? null,
		quantity: stripeItem.quantity ?? 1,
		billing_scheme: (price.billing_scheme as "per_unit" | "tiered") ?? null,
		tiers_mode: (price.tiers_mode as "graduated" | "volume") ?? null,
		tiers: extractTiers({ price }),
		recurring_interval: price.recurring?.interval ?? null,
		recurring_usage_type:
			(price.recurring?.usage_type as "licensed" | "metered") ?? null,
		metadata: stripeItem.metadata ?? {},
	};
};
