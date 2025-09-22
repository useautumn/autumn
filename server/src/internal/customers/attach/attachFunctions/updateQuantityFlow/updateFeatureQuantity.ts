import { getUsageBasedSub } from "@/external/stripe/stripeSubUtils.js";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";

import RecaseError from "@/utils/errorUtils.js";
import {
	ErrCode,
	Feature,
	FeatureOptions,
	FullCusProduct,
} from "@autumn/shared";

import { Stripe } from "stripe";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { featureToCusPrice } from "@/internal/customers/cusProducts/cusPrices/convertCusPriceUtils.js";
import { handleQuantityUpgrade } from "./handleQuantityUpgrade.js";
import { handleQuantityDowngrade } from "./handleQuantityDowngrade.js";

export const handleUpdateFeatureQuantity = async ({
	req,
	attachParams,
	cusProduct,
	stripeSubs,
	oldOptions,
	newOptions,
}: {
	req: any;
	attachParams: AttachParams;
	cusProduct: FullCusProduct;
	stripeSubs: Stripe.Subscription[];
	oldOptions: FeatureOptions;
	newOptions: FeatureOptions;
}) => {
	const { db, logger } = req;
	const { stripeCli } = attachParams;

	const prorationBehavior = "always_invoice";

	const subToUpdate = stripeSubs?.[0];
	// const subToUpdate = await getUsageBasedSub({
	//   db,
	//   stripeCli: stripeCli,
	//   subIds: cusProduct.subscription_ids || [],
	//   feature: {
	//     internal_id: newOptions.internal_feature_id,
	//     id: newOptions.feature_id,
	//   } as Feature,
	//   stripeSubs: stripeSubs,
	// });

	const cusPrice = featureToCusPrice({
		internalFeatureId: newOptions.internal_feature_id!,
		cusPrices: cusProduct.customer_prices,
	})!;

	const price = cusPrice.price;

	if (!subToUpdate) {
		throw new RecaseError({
			message: `Failed to update prepaid quantity for ${newOptions.feature_id} because no subscription found`,
			code: ErrCode.InternalError,
			statusCode: 500,
		});
	}

	let subItem = findStripeItemForPrice({
		price: price!,
		stripeItems: subToUpdate.items.data,
	}) as Stripe.SubscriptionItem;

	if (newOptions.quantity < oldOptions.quantity) {
		return await handleQuantityDowngrade({
			req,
			attachParams,
			cusProduct,
			stripeSub: subToUpdate,
			oldOptions,
			newOptions,
			subItem,
		});
	} else {
		return await handleQuantityUpgrade({
			req,
			attachParams,
			cusProduct,
			stripeSubs,
			oldOptions,
			newOptions,
			cusPrice,
			stripeSub: subToUpdate,
			subItem,
		});
	}

	// if (!price) {
	//   throw new RecaseError({
	//     message: `updateFeatureQuantity: No price found for feature ${newOptions.feature_id}`,
	//     code: ErrCode.PriceNotFound,
	//   });
	// }

	// if (!subItem) {
	//   subItem = await stripeCli.subscriptionItems.create({
	//     subscription: subToUpdate.id,
	//     price: price.config.stripe_price_id as string,
	//     quantity: newOptions.quantity,
	//     proration_behavior: prorationBehavior,
	//     payment_behavior: "error_if_incomplete",
	//   });

	//   logger.info(
	//     `updateFeatureQuantity: Successfully created sub item for feature ${newOptions.feature_id}: ${newOptions.quantity}`,
	//   );
	// } else {
	//   await stripeCli.subscriptionItems.update(subItem.id, {
	//     quantity: newOptions.quantity,
	//     proration_behavior: prorationBehavior,
	//     payment_behavior: "error_if_incomplete",
	//   });
	//   logger.info(
	//     `updateFeatureQuantity: Successfully updated sub item for feature ${newOptions.feature_id}: ${newOptions.quantity}`,
	//   );
	// }
};
