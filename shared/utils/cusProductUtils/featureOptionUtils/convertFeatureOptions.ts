import type { FeatureOptions } from "@models/cusProductModels/cusProductModels";
import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { priceUtils } from "@utils/productUtils/priceUtils/index";
import { Decimal } from "decimal.js";

/**
 * Computes the Stripe subscription-item quantity for a V2 prepaid price.
 *
 * For **graduated** prices the allowance is encoded as a free leading tier in
 * the Stripe price object, so Stripe needs the *total* packs (purchased +
 * allowance) to bill correctly.
 *
 * For **volume** prices the Stripe price has no free tier offset (the allowance
 * is tracked purely in Autumn), so only the purchased packs are sent. Stripe
 * then applies the single matching tier rate to the purchased quantity only,
 * which matches Autumn's own `volumeTiersToLineAmount` calculation.
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

	// Graduated: Stripe needs total packs (purchased + allowance) because the
	// V2 price has a free leading tier that covers the allowance.
	if (!packsExcludingAllowance) return allowanceInPacks;

	return new Decimal(packsExcludingAllowance).add(allowanceInPacks).toNumber();
};
