import { priceConfigForCurrency } from "@models/productModels/priceModels/priceConfig/priceCurrencyView";
import { PriceType } from "@models/productModels/priceModels/priceEnums";
import type { Price } from "@models/productModels/priceModels/priceModels";
import {
	TierBehavior,
	type UsagePriceConfig,
} from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import {
	normalizedAllocatedBillingBehavior,
	usageTiersToComparisonShape,
} from "./pricesAreSame.js";

/**
 * Stripe mint identity for one attach currency. Same normalizations as
 * `pricesAreSame` for the fields that land on `prices.create`.
 */
export const priceToStripePriceIdempotencyShape = ({
	price,
	currency,
	orgDefault,
}: {
	price: Price;
	currency: string;
	orgDefault: string;
}) => {
	const ccy = currency.toLowerCase();
	const { amount, usage_tiers } = priceConfigForCurrency({
		config: price.config,
		currency: ccy,
		orgDefault: orgDefault.toLowerCase(),
	});
	const usageConfig =
		price.config.type === PriceType.Usage
			? (price.config as UsagePriceConfig)
			: null;
	const billingUnits = usageConfig ? (usageConfig.billing_units ?? 1) : null;

	return {
		amount: amount ?? null,
		usage_tiers: usageTiersToComparisonShape(usage_tiers ?? []),
		interval: price.config.interval ?? null,
		interval_count: price.config.interval_count ?? 1,
		billing_units: billingUnits,
		tier_behavior: usageConfig
			? (price.tier_behavior ?? TierBehavior.Graduated)
			: null,
		bill_when: usageConfig?.bill_when ?? null,
		should_prorate: usageConfig ? (usageConfig.should_prorate ?? false) : null,
		allocated_billing_behavior: usageConfig
			? normalizedAllocatedBillingBehavior(usageConfig)
			: null,
	};
};
