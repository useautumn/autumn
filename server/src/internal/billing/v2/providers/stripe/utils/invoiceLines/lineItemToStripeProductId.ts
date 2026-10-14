import { isFixedPrice, type LineItem } from "@autumn/shared";

export const lineItemToStripeProductId = ({
	lineItem,
}: {
	lineItem: LineItem;
}): string | undefined => {
	const { price, product } = lineItem.context;

	if (!price?.config) return undefined;

	if (isFixedPrice(price)) {
		return product.processor?.id;
	}

	return price.config.stripe_product_id ?? undefined;
};
