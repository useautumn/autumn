import type { LineItem } from "@autumn/shared";
import type Stripe from "stripe";
import { lineItemToStripeProductId } from "./lineItemToStripeProductId";

/**
 * Converts a LineItem to Stripe metadata for invoice line items.
 *
 * Metadata includes:
 * - autumn_line_item_id: The Autumn line item ID (for matching back from Stripe)
 * - autumn_product_id: The Autumn product ID
 * - autumn_price_id: The Autumn price ID
 * - autumn_line_amount: The amount sent to Stripe for this line
 * - autumn_customer_price_id: The Autumn customer price ID (for multi-entity matching)
 * - stripe_product_id: The Stripe product ID (if available)
 * - coupon_ids: Comma-separated list of coupon IDs (if discounts applied)
 */
export const lineItemToMetadata = ({
	lineItem,
}: {
	lineItem: LineItem;
}): Stripe.MetadataParam => {
	const { id, context, discounts, amount, amountAfterDiscounts } = lineItem;
	const { product, price, customerPrice, discountable } = context;

	const metadata: Stripe.MetadataParam = {
		autumn_line_item_id: id,
		// Amount handed to Stripe, so a retry can tell whether the line is stale.
		autumn_line_amount: String(discountable ? amount : amountAfterDiscounts),
	};
	if (product.id) metadata.autumn_product_id = product.id;
	if (price.id) metadata.autumn_price_id = price.id;

	if (customerPrice) {
		metadata.autumn_customer_price_id = customerPrice.id;
	}

	const stripeProductId = lineItemToStripeProductId({ lineItem });
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
