import type { FeatureOptions } from "@models/cusProductModels/cusProductModels";
import type {
	UsagePriceConfig,
	UsageTier,
} from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { findTierByQuantity } from "./findTierByQuantity";

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
