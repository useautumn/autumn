import { type FullProduct, PriceType } from "@autumn/shared";
import type Stripe from "stripe";
import { subItemToAutumnInterval } from "@/external/stripe/utils.js";
import { constructPrice } from "../priceUtils.js";

export const subItemToFixedPrice = ({
	subItem,
	product,
	basePrice,
}: {
	subItem: Stripe.SubscriptionItem;
	product: FullProduct;
	basePrice?: number;
}) => {
	const { price } = subItem;

	const { interval, intervalCount } = subItemToAutumnInterval(subItem);
	return constructPrice({
		internalProductId: product.internal_id,
		isCustom: true,
		orgId: product.org_id,
		fixedConfig: {
			type: PriceType.Fixed,
			amount: basePrice || (price.unit_amount || 0) / 100,
			interval,
			interval_count: intervalCount,
			stripe_price_id: price.id,
		},
	});
};
