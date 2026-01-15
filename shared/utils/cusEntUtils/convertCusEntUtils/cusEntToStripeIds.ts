import { InternalError } from "../../../api/errors/base/InternalError";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { cusEntToCusPrice } from "./cusEntToCusPrice";

export const cusEntToStripeIds = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (!cusPrice) {
		throw new InternalError({
			message: `[cusEntToStripeIds] No cus price found for cus ent (feature: ${cusEnt.entitlement.feature_id})`,
		});
	}

	const stripePriceId = cusPrice.price.config.stripe_price_id;
	const stripeProductId =
		cusPrice.price.config.stripe_product_id ||
		cusEnt.customer_product?.product?.processor?.id;

	return {
		stripePriceId: stripePriceId ?? undefined,
		stripeProductId: stripeProductId ?? undefined,
	};
};
