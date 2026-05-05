import {
	type FeatureOptions,
	type FullProduct,
	isAllocatedPrice,
	isConsumablePrice,
	isPrepaidPrice,
	priceToEnt,
} from "@autumn/shared";
import type Stripe from "stripe";
import { stripeItemToFeatureOptionsQuantity } from "@/external/stripe/common/utils/stripeItemToFeatureOptionsQuantity.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { findSubscriptionItemForAutumnPrice } from "../autumnToStripe/findSubscriptionItemForAutumnPrice.js";

export const subscriptionToPrepaidFeatureOptions = ({
	ctx,
	stripeSubscription,
	matchedProduct,
}: {
	ctx: Pick<AutumnContext, "logger">;
	stripeSubscription: Stripe.Subscription;
	matchedProduct: FullProduct;
}): FeatureOptions[] => {
	const prepaidFeatureOptions: FeatureOptions[] = [];
	const stripeSubscriptionItems = stripeSubscription.items.data;

	for (const price of matchedProduct.prices) {
		if (isPrepaidPrice(price)) {
			const entitlement = priceToEnt({
				price,
				entitlements: matchedProduct.entitlements,
			});

			if (!entitlement) {
				ctx.logger.warn(
					`sub.created auto-sync: prepaid price ${price.id} on product ${matchedProduct.id} has no matching entitlement; skipping quantity import`,
				);
				continue;
			}

			const stripeSubscriptionItem = findSubscriptionItemForAutumnPrice({
				price,
				product: matchedProduct,
				stripeSubscriptionItems,
			});

			const quantity = stripeSubscriptionItem
				? stripeItemToFeatureOptionsQuantity({
						itemQuantity: stripeSubscriptionItem.quantity ?? 0,
						price,
						product: matchedProduct,
					})
				: 0;

			if (!stripeSubscriptionItem) {
				ctx.logger.warn(
					`sub.created auto-sync: no Stripe subscription item matched prepaid price ${price.id} on product ${matchedProduct.id}; initializing quantity to 0`,
				);
			}

			prepaidFeatureOptions.push({
				feature_id: entitlement.feature.id,
				internal_feature_id: entitlement.feature.internal_id,
				quantity,
			});
			continue;
		}

		if (isConsumablePrice(price)) {
			const stripeSubscriptionItem = findSubscriptionItemForAutumnPrice({
				price,
				product: matchedProduct,
				stripeSubscriptionItems,
			});

			if (!stripeSubscriptionItem) {
				ctx.logger.warn(
					`sub.created auto-sync: no Stripe subscription item matched consumable price ${price.id} on product ${matchedProduct.id}`,
				);
			}
			continue;
		}

		if (isAllocatedPrice(price)) {
			ctx.logger.info(
				`sub.created auto-sync: skipping allocated price ${price.id} on product ${matchedProduct.id}; allocated auto-sync is deferred`,
			);
		}
	}

	return prepaidFeatureOptions;
};
