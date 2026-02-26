import type { FeatureOptions } from "@models/cusProductModels/cusProductModels";
import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { priceUtils } from "@utils/productUtils/priceUtils/index";
import { Decimal } from "decimal.js";

/**
 * Computes the Stripe subscription-item quantity for a V2 prepaid price.
 *
 * Always returns total packs (purchased + allowance) for both graduated and
 * volume pricing. The V2 Stripe price has a free leading tier that covers
 * the allowance, so Stripe needs the full quantity to bill correctly.
 *
 * For **volume** prices: if total quantity exceeds the free tier, the ENTIRE
 * quantity (including included) is charged at the matching paid tier's rate.
 * This is the intended behavior — volume pricing does not subtract included
 * usage before applying the tier rate.
 */
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

	if (!packsExcludingAllowance) return allowanceInPacks;

	return new Decimal(packsExcludingAllowance).add(allowanceInPacks).toNumber();
};
