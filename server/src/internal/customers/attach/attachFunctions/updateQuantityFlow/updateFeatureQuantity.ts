import {
	type AttachConfig,
	ErrCode,
	type FeatureOptions,
	type FullCusProduct,
} from "@autumn/shared";
import type { Stripe } from "stripe";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { featureToCusPrice } from "@/internal/customers/cusProducts/cusPrices/convertCusPriceUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { handleQuantityDowngrade } from "./handleQuantityDowngrade.js";
import { handleQuantityUpgrade } from "./handleQuantityUpgrade.js";

export const handleUpdateFeatureQuantity = async ({
	req,
	attachParams,
	attachConfig,
	cusProduct,
	stripeSubs,
	oldOptions,
	newOptions,
}: {
	req: any;
	attachParams: AttachParams;
	attachConfig: AttachConfig;
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

	const subItem = findStripeItemForPrice({
		price: price!,
		stripeItems: subToUpdate.items.data,
	}) as Stripe.SubscriptionItem;

	if (newOptions.quantity < oldOptions.quantity) {
		return await handleQuantityDowngrade({
			req,
			attachParams,
			attachConfig,
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
			attachConfig,
			cusProduct,
			stripeSubs,
			oldOptions,
			newOptions,
			cusPrice,
			stripeSub: subToUpdate,
			subItem,
		});
	}
};
