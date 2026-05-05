import { type Product, productToStripeId } from "@autumn/shared";
import type { ProductMatchCondition } from "./matchConditions";

/**
 * Find the match condition (if any) between an Autumn product and a pool
 * of Stripe product ids. Returns null when the product's processor id is
 * absent or not in the pool.
 */
export const findStripeMatchForAutumnProduct = ({
	product,
	stripeProductIds,
}: {
	product: Product;
	stripeProductIds: Set<string>;
}): ProductMatchCondition | null => {
	const stripeProductId = productToStripeId({ product });
	if (!stripeProductId) return null;
	if (!stripeProductIds.has(stripeProductId)) return null;
	return { type: "stripe_product_id", stripe_product_id: stripeProductId };
};
