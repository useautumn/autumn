/** biome-ignore-all lint/suspicious/noDoubleEquals: legacy product comparison intentionally uses loose numeric/nullish equality */

import {
	AllocatedBillingBehavior,
	FixedPriceConfigSchema,
	type Price,
	type PriceCurrencyConfig,
	PriceType,
	TierBehavior,
	type UsagePriceConfig,
	UsagePriceConfigSchema,
	type UsageTier,
} from "@autumn/shared";

/** Unset behavior follows the allocated v1 shape: derived from should_prorate. */
export const normalizedAllocatedBillingBehavior = (
	usageConfig: UsagePriceConfig,
) =>
	usageConfig.allocated_billing_behavior ??
	(usageConfig.should_prorate
		? AllocatedBillingBehavior.Prorated
		: AllocatedBillingBehavior.Arrear);

/** Last `to` is ignored; unset `flat_amount` is 0. */
export const usageTiersToComparisonShape = (tiers: UsageTier[]) =>
	tiers.map((tier, index) => ({
		amount: tier.amount,
		flat_amount: tier.flat_amount ?? 0,
		to: index === tiers.length - 1 ? null : tier.to,
	}));

export const tiersAreSame = (tiers1: UsageTier[], tiers2: UsageTier[]) => {
	if (tiers1.length !== tiers2.length) return false;
	const shape1 = usageTiersToComparisonShape(tiers1);
	const shape2 = usageTiersToComparisonShape(tiers2);
	return shape1.every((tier, index) => {
		const other = shape2[index];
		return (
			tier.amount === other?.amount &&
			tier.flat_amount === other.flat_amount &&
			tier.to === other.to
		);
	});
};

const hasCatalogCurrencies = (
	currencies: Record<string, PriceCurrencyConfig> | null | undefined,
) => Object.keys(currencies ?? {}).length > 0;

// Add/remove of a catalog currency is compatible (existing customers keep
// snapshots); only amount mismatches for a currency present on both sides differ.
const currenciesAreCompatible = (
	currencies1: Record<string, PriceCurrencyConfig> | null | undefined,
	currencies2: Record<string, PriceCurrencyConfig> | null | undefined,
) => {
	const map1 = currencies1 ?? {};
	const map2 = currencies2 ?? {};
	for (const key of Object.keys(map1)) {
		const block2 = map2[key];
		if (!block2) continue;
		const block1 = map1[key];
		if ((block1?.amount ?? null) !== (block2.amount ?? null)) return false;
		if (!tiersAreSame(block1?.usage_tiers ?? [], block2.usage_tiers ?? [])) {
			return false;
		}
	}
	return true;
};

const currenciesHaveSameDefinition = (
	currencies1: Record<string, PriceCurrencyConfig> | null | undefined,
	currencies2: Record<string, PriceCurrencyConfig> | null | undefined,
) => {
	const keys1 = Object.keys(currencies1 ?? {});
	const keys2 = Object.keys(currencies2 ?? {});
	if (keys1.length !== keys2.length) return false;
	return (
		currenciesAreCompatible(currencies1, currencies2) &&
		keys1.every((key) => currencies2?.[key] !== undefined)
	);
};

export const priceCurrencyDefinitionsAreSame = (price1: Price, price2: Price) =>
	(price1.config.base_currency ?? null) ===
		(price2.config.base_currency ?? null) &&
	currenciesHaveSameDefinition(
		price1.config.currencies,
		price2.config.currencies,
	);

// base_currency is FX bookkeeping — it appears/disappears with the currencies
// map. Only treat a mismatch as a change when both sides already carry FX.
const baseCurrenciesAreCompatible = ({
	base1,
	base2,
	currencies1,
	currencies2,
}: {
	base1: string | null | undefined;
	base2: string | null | undefined;
	currencies1: Record<string, PriceCurrencyConfig> | null | undefined;
	currencies2: Record<string, PriceCurrencyConfig> | null | undefined;
}) => {
	if ((base1 ?? null) === (base2 ?? null)) return true;
	if (hasCatalogCurrencies(currencies1) !== hasCatalogCurrencies(currencies2)) {
		return true;
	}
	return false;
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
				(fixedConfig1.interval_count ?? 1) !==
				(fixedConfig2.interval_count ?? 1),
			baseCurrency: !baseCurrenciesAreCompatible({
				base1: fixedConfig1.base_currency,
				base2: fixedConfig2.base_currency,
				currencies1: fixedConfig1.currencies,
				currencies2: fixedConfig2.currencies,
			}),
			currencies: !currenciesAreCompatible(
				fixedConfig1.currencies,
				fixedConfig2.currencies,
			),
		};

		return !Object.values(diffs).some(Boolean);
	}

	const usageConfig1 = UsagePriceConfigSchema.parse(config1);
	const usageConfig2 = UsagePriceConfigSchema.parse(config2);

	const configDiffs = {
		shouldProrate:
			(usageConfig1.should_prorate ?? false) !==
			(usageConfig2.should_prorate ?? false),
		allocatedBillingBehavior:
			normalizedAllocatedBillingBehavior(usageConfig1) !==
			normalizedAllocatedBillingBehavior(usageConfig2),
		billWhen: usageConfig1.bill_when !== usageConfig2.bill_when,
		billingUnits:
			(usageConfig1.billing_units ?? 1) !== (usageConfig2.billing_units ?? 1),
		interval: usageConfig1.interval !== usageConfig2.interval,
		intervalCount:
			(usageConfig1.interval_count ?? 1) !== (usageConfig2.interval_count ?? 1),
		internalFeatureId:
			usageConfig1.internal_feature_id !== usageConfig2.internal_feature_id,
		featureId: usageConfig1.feature_id !== usageConfig2.feature_id,
		usageTiers: !tiersAreSame(
			usageConfig1.usage_tiers,
			usageConfig2.usage_tiers,
		),
		baseCurrency: !baseCurrenciesAreCompatible({
			base1: usageConfig1.base_currency,
			base2: usageConfig2.base_currency,
			currencies1: usageConfig1.currencies,
			currencies2: usageConfig2.currencies,
		}),
		currencies: !currenciesAreCompatible(
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
		tierBehavior:
			(price1.tier_behavior ?? TierBehavior.Graduated) !==
			(price2.tier_behavior ?? TierBehavior.Graduated),
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
