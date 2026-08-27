import { priceConfigForCurrency } from "@models/productModels/priceModels/priceConfig/priceCurrencyView";
import { PriceType } from "@models/productModels/priceModels/priceEnums";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { usageTiersToComparisonShape } from "./pricesAreSame.js";

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
	const usage = price.config.type === PriceType.Usage;
	const billingUnits =
		usage && "billing_units" in price.config
			? (price.config.billing_units ?? 1)
			: null;

	return {
		amount: amount ?? null,
		usage_tiers: usageTiersToComparisonShape(usage_tiers ?? []),
		interval: price.config.interval ?? null,
		interval_count: price.config.interval_count ?? 1,
		billing_units: billingUnits,
		tier_behavior: usage
			? (price.tier_behavior ?? TierBehavior.Graduated)
			: null,
	};
};
