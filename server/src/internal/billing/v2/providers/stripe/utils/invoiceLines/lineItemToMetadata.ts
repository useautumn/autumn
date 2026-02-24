import type { LineItem } from "@autumn/shared";
import type Stripe from "stripe";

/**
 * Converts a LineItem to Stripe metadata for invoice line items.
 *
 * Metadata includes:
 * - autumn_product_id: The Autumn product ID
 * - autumn_price_id: The Autumn price ID
 * - stripe_product_id: The Stripe product ID (if available)
 * - coupon_ids: Comma-separated list of coupon IDs (if discounts applied)
 */
export const lineItemToMetadata = ({
	lineItem,
}: {
	lineItem: LineItem;
}): Stripe.MetadataParam => {
	const { context, discounts } = lineItem;
	const { product, price } = context;

	const metadata: Stripe.MetadataParam = {
		autumn_product_id: product.id,
		autumn_price_id: price.id,
	};

	const stripeProductId = product.processor?.id;
	if (stripeProductId) {
		metadata.stripe_product_id = stripeProductId;
	}

	if (discounts.length > 0) {
		const couponIds = discounts
			.map((d) => d.stripeCouponId)
			.filter(Boolean)
			.join(",");
		if (couponIds) {
			metadata.coupon_ids = couponIds;
		}
	}

	return metadata;
};
