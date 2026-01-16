import {
	type AttachConfig,
	ErrCode,
	type FeatureOptions,
	type FullCusProduct,
	findCusPriceByFeature,
} from "@autumn/shared";
import type { Stripe } from "stripe";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import RecaseError from "@/utils/errorUtils.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";
import { handleQuantityDowngrade } from "./handleQuantityDowngrade.js";
import { handleQuantityUpgrade } from "./handleQuantityUpgrade.js";

export const handleUpdateFeatureQuantity = async ({
	ctx,
	attachParams,
	attachConfig,
	cusProduct,
	stripeSubs,
	oldOptions,
	newOptions,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	attachConfig: AttachConfig;
	cusProduct: FullCusProduct;
	stripeSubs: Stripe.Subscription[];
	oldOptions: FeatureOptions;
	newOptions: FeatureOptions;
}) => {
	const subToUpdate = stripeSubs?.[0];

	const cusPrice = findCusPriceByFeature({
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
			ctx,
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
			ctx,
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
