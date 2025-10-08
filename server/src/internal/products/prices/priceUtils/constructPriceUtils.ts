import {
	type FullProduct,
	PriceType,
	stripeToAtmnAmount,
} from "@autumn/shared";
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

	const atmnAmount = stripeToAtmnAmount({
		amount: price.unit_amount || 0,
		currency: price.currency,
	});

	return constructPrice({
		internalProductId: product.internal_id,
		isCustom: true,
		orgId: product.org_id,
		fixedConfig: {
			type: PriceType.Fixed,
			amount: basePrice || atmnAmount,
			interval,
			interval_count: intervalCount,
			stripe_price_id: price.id,

			stripe_product_id: undefined,
			feature_id: undefined,
			internal_feature_id: undefined,
		},
	});
};
