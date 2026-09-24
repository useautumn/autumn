import { isFixedPrice, type LineItem } from "@autumn/shared";

/**
 * Resolve the Stripe product ID for a billing line item.
 * Prefers the explicit line-item mapping and falls back to context-derived IDs.
 */
export const lineItemToStripeProductId = ({
	lineItem,
}: {
	lineItem: LineItem;
}): string | undefined => {
	const { price, product } = lineItem.context;

	// Custom line items carry an empty price and bill by raw amount.
	if (!price?.config) return undefined;

	if (isFixedPrice(price)) {
		return product.processor?.id;
	}

	return price.config.stripe_product_id ?? undefined;
};
