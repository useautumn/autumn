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
	const isBase = isFixedPrice(lineItem.context.price);

	const { price, product } = lineItem.context;

	if (isBase) {
		return product.processor?.id;
	}

	return price.config.stripe_product_id ?? undefined;
};
