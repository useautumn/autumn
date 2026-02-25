/** biome-ignore-all lint/suspicious/noDoubleEquals: need to use falsy check */
import {
	FixedPriceConfigSchema,
	type Price,
	PriceType,
	UsagePriceConfigSchema,
	type UsageTier,
} from "@autumn/shared";

export const tiersAreSame = (tiers1: UsageTier[], tiers2: UsageTier[]) => {
	if (tiers1.length !== tiers2.length) return false;
	for (let i = 0; i < tiers1.length; i++) {
		const tier1 = tiers1[i];
		const tier2 = tiers2[i];
		// if (tier1.to !== tier2.to) return false;

		// Only compare to if not last tier
		if (i !== tiers1.length - 1) {
			if (tier1.to !== tier2.to) return false;
		}

		if (tier1.amount !== tier2.amount) return false;
	}
	return true;
};

export const pricesAreSame = (
	price1: Price,
	price2: Price,
	logDifferences = false,
) => {
	// if (price1.name !== price2.name) return false;

	const config1 = price1.config!;
	const config2 = price2.config!;
	// if (config1.type !== config2.type) return false; // shouldn't be able to change, but just in case...

	if (config1.type === PriceType.Fixed) {
		const fixedConfig1 = FixedPriceConfigSchema.parse(config1);
		const fixedConfig2 = FixedPriceConfigSchema.parse(config2);

		// 1. Check amount same
		const diffs = {
			amount: {
				condition: fixedConfig1.amount !== fixedConfig2.amount,
				message: `Amount different: ${fixedConfig1.amount} !== ${fixedConfig2.amount}`,
			},
			interval: {
				condition: fixedConfig1.interval !== fixedConfig2.interval,
				message: `Interval different: ${fixedConfig1.interval} !== ${fixedConfig2.interval}`,
			},
			interval_count: {
				condition: fixedConfig1.interval_count !== fixedConfig2.interval_count,
				message: `Interval count different: ${fixedConfig1.interval_count} !== ${fixedConfig2.interval_count}`,
			},
		};

		const pricesAreDiff = Object.values(diffs).some((d) => d.condition);

		if (pricesAreDiff) {
			console.log("Fixed price different");
			console.log(
				"Differences:",
				Object.values(diffs)
					.filter((d) => d.condition)
					.map((d) => d.message),
			);
		}

		return !pricesAreDiff;
	} else {
		const usageConfig1 = UsagePriceConfigSchema.parse(config1);
		const usageConfig2 = UsagePriceConfigSchema.parse(config2);

		const diffs = {
			should_prorate: {
				condition: usageConfig1.should_prorate !== usageConfig2.should_prorate,
				message: `Should prorate different: ${usageConfig1.should_prorate} !== ${usageConfig2.should_prorate}`,
			},
			bill_when: {
				condition: usageConfig1.bill_when !== usageConfig2.bill_when,
				message: `Bill when different: ${usageConfig1.bill_when} !== ${usageConfig2.bill_when}`,
			},
			billing_units: {
				condition: usageConfig1.billing_units !== usageConfig2.billing_units,
				message: `Billing units different: ${usageConfig1.billing_units} !== ${usageConfig2.billing_units}`,
			},
			interval: {
				condition: usageConfig1.interval !== usageConfig2.interval,
				message: `Interval different: ${usageConfig1.interval} !== ${usageConfig2.interval}`,
			},
			interval_count: {
				condition: usageConfig1.interval_count !== usageConfig2.interval_count,
				message: `Interval count different: ${usageConfig1.interval_count} !== ${usageConfig2.interval_count}`,
			},
			internal_feature_id: {
				condition:
					usageConfig1.internal_feature_id !== usageConfig2.internal_feature_id,
				message: `Internal feature ID different: ${usageConfig1.internal_feature_id} !== ${usageConfig2.internal_feature_id}`,
			},
			feature_id: {
				condition: usageConfig1.feature_id !== usageConfig2.feature_id,
				message: `Feature ID different: ${usageConfig1.feature_id} !== ${usageConfig2.feature_id}`,
			},
			usage_tiers: {
				condition: !tiersAreSame(
					usageConfig1.usage_tiers,
					usageConfig2.usage_tiers,
				),
				message: `Usage tiers different: ${usageConfig1.usage_tiers.map(
					(t) => `${t.to} (${t.amount})`,
				)} !== ${usageConfig2.usage_tiers.map((t) => `${t.to} (${t.amount})`)}`,
			},
		};

		const prorationConfig1 = price1.proration_config;
		const prorationConfig2 = price2.proration_config;

		const prorationConfigDiff = {
			on_increase: {
				condition:
					prorationConfig1?.on_increase != prorationConfig2?.on_increase,
				message: `On increase different: ${prorationConfig1?.on_increase} != ${prorationConfig2?.on_increase}`,
			},
			on_decrease: {
				condition:
					prorationConfig1?.on_decrease != prorationConfig2?.on_decrease,
				message: `On decrease different: ${prorationConfig1?.on_decrease} != ${prorationConfig2?.on_decrease}`,
			},
			tier_behavior: {
				condition: price1.tier_behavior != price2.tier_behavior,
				message: `Tier behaviour different: ${price1.tier_behavior} != ${price2.tier_behavior}`,
			},
		};

		const pricesAreDiff =
			Object.values(diffs).some((d) => d.condition) ||
			Object.values(prorationConfigDiff).some((d) => d.condition);

		if (pricesAreDiff && logDifferences) {
			console.log(`Usage price different: ${usageConfig1.feature_id}`);
			console.log(
				"Differences:",
				Object.values(diffs)
					.filter((d) => d.condition)
					.map((d) => d.message),
				Object.values(prorationConfigDiff)
					.filter((d) => d.condition)
					.map((d) => d.message),
			);
		}

		return !pricesAreDiff;
	}
};
