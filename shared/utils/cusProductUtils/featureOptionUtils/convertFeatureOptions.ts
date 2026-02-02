import type { FeatureOptions } from "@models/cusProductModels/cusProductModels";
import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { priceUtils } from "@utils/productUtils/priceUtils/index";
import { Decimal } from "decimal.js";

export const featureOptionsToV2StripeQuantity = ({
	featureOptions,
	price,
	entitlement,
}: {
	featureOptions?: FeatureOptions;
	price: Price;
	entitlement: EntitlementWithFeature;
}) => {
	const packsExcludingAllowance =
		featureOptions?.upcoming_quantity ?? featureOptions?.quantity;

	const allowanceInPacks = priceUtils.convert.toAllowanceInPacks({
		price,
		entitlement,
	});

	// 1. If no packs, return allowance
	if (!packsExcludingAllowance) return allowanceInPacks;

	// 2. Otherwise, return the total quantity
	return new Decimal(packsExcludingAllowance).add(allowanceInPacks).toNumber();
};
