import { InternalError } from "../../../api/errors/base/InternalError";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { getPriceCurrencyStripeId } from "../../../models/productModels/priceModels/priceConfig/priceCurrencyView";
import { cusEntToCusPrice } from "./cusEntToCusPrice";

export const cusEntToStripeIds = ({
	cusEnt,
	currency,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	currency?: string;
}) => {
	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (!cusPrice) {
		throw new InternalError({
			message: `[cusEntToStripeIds] No cus price found for cus ent (feature: ${cusEnt.entitlement.feature_id})`,
		});
	}

	const config = cusPrice.price.config;
	const stripePriceId = currency
		? getPriceCurrencyStripeId({
				config,
				currency,
				orgDefault: config.base_currency ?? currency,
				slot: "stripe_price_id",
			})
		: config.stripe_price_id;
	const stripeProductId =
		config.stripe_product_id || cusEnt.customer_product?.product?.processor?.id;

	return {
		stripePriceId: stripePriceId ?? undefined,
		stripeProductId: stripeProductId ?? undefined,
	};
};
