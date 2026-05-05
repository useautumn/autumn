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
 * Normalize a Stripe.SubscriptionSchedule.Phase.Item to a StripeItemSnapshot.
 *
 * Phase items don't carry a stable Stripe ID, so the caller supplies a
 * synthetic id (typically `${phaseIndex}:${itemIndex}`).
 *
 * If the price was not expanded, only the price ID is available; pricing
 * fields (amount, currency, tiers) will be null and must be enriched later.
 */
export const normalizePhaseItem = ({
	phaseItem,
	syntheticId,
}: {
	phaseItem: Stripe.SubscriptionSchedule.Phase.Item;
	syntheticId: string;
}): StripeItemSnapshot | null => {
	const rawPrice = phaseItem.price as string | Stripe.Price | undefined;
	if (!rawPrice) return null;

	const expandedPrice = typeof rawPrice === "object" ? rawPrice : null;
	const stripePriceId =
		typeof rawPrice === "string" ? rawPrice : (expandedPrice?.id ?? null);
	if (!stripePriceId) return null;

	const stripeProductId = expandedPrice
		? resolveStripeProductId({ product: expandedPrice.product })
		: null;

	// When unexpanded, we don't have product_id — the snapshot requires it.
	// Caller must expand `phases.items.price` (or enrich post-normalize)
	// before classification can succeed.
	if (!stripeProductId) return null;

	return {
		id: syntheticId,
		stripe_price_id: stripePriceId,
		stripe_product_id: stripeProductId,
		unit_amount: expandedPrice?.unit_amount ?? null,
		currency: expandedPrice?.currency ?? null,
		quantity: phaseItem.quantity ?? 1,
		billing_scheme:
			(expandedPrice?.billing_scheme as "per_unit" | "tiered") ?? null,
		tiers_mode:
			(expandedPrice?.tiers_mode as "graduated" | "volume") ?? null,
		tiers: expandedPrice ? extractTiers({ price: expandedPrice }) : null,
		recurring_interval: expandedPrice?.recurring?.interval ?? null,
		recurring_usage_type:
			(expandedPrice?.recurring?.usage_type as "licensed" | "metered") ?? null,
		metadata: phaseItem.metadata ?? {},
	};
};
