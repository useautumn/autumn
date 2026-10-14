import type { LineItem } from "@autumn/shared";
import type Stripe from "stripe";
import { lineItemToStripeProductId } from "./lineItemToStripeProductId";

export const lineItemToMetadata = ({
	lineItem,
}: {
	lineItem: LineItem;
}): Stripe.MetadataParam => {
	const { id, context, discounts, amount, amountAfterDiscounts } = lineItem;
	const { product, price, customerPrice, discountable } = context;

	const metadata: Stripe.MetadataParam = {
		autumn_line_item_id: id,
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
