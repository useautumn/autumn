/** biome-ignore-all lint/suspicious/noDoubleEquals: legacy product comparison intentionally uses loose numeric/nullish equality */

import {
	FixedPriceConfigSchema,
	type Price,
	type PriceCurrencyConfig,
	PriceType,
	UsagePriceConfigSchema,
	type UsageTier,
} from "@autumn/shared";

export const tiersAreSame = (tiers1: UsageTier[], tiers2: UsageTier[]) => {
	if (tiers1.length !== tiers2.length) return false;
	for (let i = 0; i < tiers1.length; i++) {
		const tier1 = tiers1[i];
		const tier2 = tiers2[i];

		if (i !== tiers1.length - 1 && tier1.to !== tier2.to) return false;
		if (tier1.amount !== tier2.amount) return false;
		if ((tier1.flat_amount ?? 0) !== (tier2.flat_amount ?? 0)) return false;
	}
	return true;
};

const currenciesAreSame = (
	currencies1: Record<string, PriceCurrencyConfig> | null | undefined,
	currencies2: Record<string, PriceCurrencyConfig> | null | undefined,
) => {
	const keys1 = Object.keys(currencies1 ?? {});
	const keys2 = Object.keys(currencies2 ?? {});
	if (keys1.length !== keys2.length) return false;
	for (const key of keys1) {
		const block1 = currencies1?.[key];
		const block2 = currencies2?.[key];
		if (!block2) return false;
		if ((block1?.amount ?? null) !== (block2.amount ?? null)) return false;
		if (!tiersAreSame(block1?.usage_tiers ?? [], block2.usage_tiers ?? [])) {
			return false;
		}
	}
	return true;
};

export const pricesAreSame = (
	price1: Price,
	price2: Price,
	logDifferences = false,
) => {
	const config1 = price1.config;
	const config2 = price2.config;

	if (config1.type !== config2.type) return false;

	if (config1.type === PriceType.Fixed) {
		const fixedConfig1 = FixedPriceConfigSchema.parse(config1);
		const fixedConfig2 = FixedPriceConfigSchema.parse(config2);

		const diffs = {
			amount: fixedConfig1.amount !== fixedConfig2.amount,
			interval: fixedConfig1.interval !== fixedConfig2.interval,
			intervalCount:
				fixedConfig1.interval_count !== fixedConfig2.interval_count,
			baseCurrency:
				(fixedConfig1.base_currency ?? null) !==
				(fixedConfig2.base_currency ?? null),
			currencies: !currenciesAreSame(
				fixedConfig1.currencies,
				fixedConfig2.currencies,
			),
		};

		return !Object.values(diffs).some(Boolean);
	}

	const usageConfig1 = UsagePriceConfigSchema.parse(config1);
	const usageConfig2 = UsagePriceConfigSchema.parse(config2);

	const configDiffs = {
		shouldProrate: usageConfig1.should_prorate !== usageConfig2.should_prorate,
		allocatedBillingBehavior:
			usageConfig1.allocated_billing_behavior !==
			usageConfig2.allocated_billing_behavior,
		billWhen: usageConfig1.bill_when !== usageConfig2.bill_when,
		billingUnits: usageConfig1.billing_units !== usageConfig2.billing_units,
		interval: usageConfig1.interval !== usageConfig2.interval,
		intervalCount: usageConfig1.interval_count !== usageConfig2.interval_count,
		internalFeatureId:
			usageConfig1.internal_feature_id !== usageConfig2.internal_feature_id,
		featureId: usageConfig1.feature_id !== usageConfig2.feature_id,
		usageTiers: !tiersAreSame(
			usageConfig1.usage_tiers,
			usageConfig2.usage_tiers,
		),
		baseCurrency:
			(usageConfig1.base_currency ?? null) !==
			(usageConfig2.base_currency ?? null),
		currencies: !currenciesAreSame(
			usageConfig1.currencies,
			usageConfig2.currencies,
		),
	};

	const prorationDiffs = {
		onIncrease:
			price1.proration_config?.on_increase !=
			price2.proration_config?.on_increase,
		onDecrease:
			price1.proration_config?.on_decrease !=
			price2.proration_config?.on_decrease,
		tierBehavior: price1.tier_behavior != price2.tier_behavior,
	};

	const pricesAreDiff =
		Object.values(configDiffs).some(Boolean) ||
		Object.values(prorationDiffs).some(Boolean);

	if (pricesAreDiff && logDifferences) {
		console.log("Prices are different", {
			configDiffs,
			prorationDiffs,
		});
	}

	return !pricesAreDiff;
};
