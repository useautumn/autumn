import { type Product, productToStripeIds } from "@autumn/shared";
import type { ProductMatchCondition } from "./matchConditions";

/**
 * Find the match condition (if any) between an Autumn product and a pool
 * of Stripe product ids. Checks the processor id plus any `additional_ids`
 * aliases; the condition carries whichever id actually matched.
 */
export const findStripeMatchForAutumnProduct = ({
	product,
	stripeProductIds,
}: {
	product: Product;
	stripeProductIds: Set<string>;
}): ProductMatchCondition | null => {
	for (const stripeProductId of productToStripeIds({ product })) {
		if (stripeProductIds.has(stripeProductId)) {
			return { type: "stripe_product_id", stripe_product_id: stripeProductId };
		}
	}
	return null;
};
