import type { FeatureOptions } from "@models/cusProductModels/cusProductModels";
import type {
	UsagePriceConfig,
	UsageTier,
} from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { findTierByQuantity } from "./findTierByQuantity";

/**
 * Find the volume-tier the customer is currently on, given a prepaid `Price`
 * and the matching `FeatureOptions` entry from `cusProduct.options`.
 *
 * Convention (Autumn prepaid):
 *  - `options.quantity` is in PACKS and EXCLUDES the entitlement allowance.
 *  - Tier `to` boundaries on the price are paid-only — they also EXCLUDE the
 *    allowance.
 *  - Lookup quantity = `options.quantity * billing_units` (paid credits).
 *
 * Returns the matching tier (or undefined when no tier covers the quantity —
 * shouldn't happen if the tier list ends with `Infinite`).
 */
export const findTierByOptions = ({
	price,
	options,
}: {
	price: Price;
	options: FeatureOptions | undefined;
}): UsageTier | undefined => {
	const config = price.config as UsagePriceConfig;
	const billingUnits = config.billing_units ?? 1;
	const paidQuantity = (options?.quantity ?? 0) * billingUnits;
	return findTierByQuantity({
		tiers: config.usage_tiers ?? [],
		quantity: paidQuantity,
	});
};
