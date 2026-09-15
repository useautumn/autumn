import {
	type Entitlement,
	FixedPriceConfigSchema,
	type Price,
	PriceType,
	TierBehavior,
	UsagePriceConfigSchema,
} from "@autumn/shared";
import {
	normalizedEntitlementInterval,
	normalizedEntitlementIntervalCount,
} from "@autumn/shared/utils/productUtils/entUtils/compareEnt/entsAreSame";
import {
	normalizedAllocatedBillingBehavior,
	usageTiersToComparisonShape,
} from "@autumn/shared/utils/productUtils/priceUtils/comparePrice/pricesAreSame";

/** One field the comparator saw differently on the stored and desired rows. */
export type RowDifference = { path: string; stored: unknown; desired: unknown };

const collect = <Row>({
	stored,
	desired,
	probes,
}: {
	stored: Row;
	desired: Row;
	probes: { path: string; read: (row: Row) => unknown }[];
}): RowDifference[] =>
	probes.flatMap(({ path, read }) => {
		const a = read(stored);
		const b = read(desired);
		return JSON.stringify(a) === JSON.stringify(b)
			? []
			: [{ path, stored: a, desired: b }];
	});

/**
 * The same fields `entsAreSame` compares, reported by name. Kept beside the
 * comparator rather than inside it so a test failure names the field without
 * the production path paying for the strings.
 */
export const describeEntitlementDifferences = ({
	stored,
	desired,
}: {
	stored: Entitlement;
	desired: Entitlement;
}): RowDifference[] =>
	collect({
		stored,
		desired,
		probes: [
			{ path: "internal_feature_id", read: (e) => e.internal_feature_id },
			{ path: "allowance_type", read: (e) => e.allowance_type ?? null },
			{ path: "allowance", read: (e) => e.allowance ?? null },
			{ path: "interval", read: (e) => normalizedEntitlementInterval(e) },
			{
				path: "interval_count",
				read: (e) => normalizedEntitlementIntervalCount(e),
			},
			{
				path: "carry_from_previous",
				read: (e) => e.carry_from_previous ?? false,
			},
			{ path: "entity_feature_id", read: (e) => e.entity_feature_id || null },
			{ path: "pooled", read: (e) => e.pooled ?? false },
			{ path: "usage_limit", read: (e) => e.usage_limit ?? null },
			{ path: "rollover", read: (e) => e.rollover ?? null },
			{ path: "feature_override", read: (e) => e.feature_override ?? null },
		],
	});

/** The comparator's view of a currency block: amount and tier shape only. */
const currenciesShape = (price: Price) =>
	Object.fromEntries(
		Object.entries(price.config.currencies ?? {}).map(([code, block]) => [
			code,
			{
				amount: block.amount ?? null,
				usage_tiers: usageTiersToComparisonShape(block.usage_tiers ?? []),
			},
		]),
	);

const fixedProbes: { path: string; read: (p: Price) => unknown }[] = [
	{
		path: "config.amount",
		read: (p) => FixedPriceConfigSchema.parse(p.config).amount,
	},
	{ path: "config.interval", read: (p) => p.config.interval },
	{ path: "config.interval_count", read: (p) => p.config.interval_count ?? 1 },
	{ path: "config.base_currency", read: (p) => p.config.base_currency ?? null },
	{ path: "config.currencies", read: currenciesShape },
];

const usageProbes: { path: string; read: (p: Price) => unknown }[] = [
	{
		path: "config.should_prorate",
		read: (p) => UsagePriceConfigSchema.parse(p.config).should_prorate ?? false,
	},
	{
		path: "config.allocated_billing_behavior",
		read: (p) =>
			normalizedAllocatedBillingBehavior(
				UsagePriceConfigSchema.parse(p.config),
			),
	},
	{
		path: "config.bill_when",
		read: (p) => UsagePriceConfigSchema.parse(p.config).bill_when,
	},
	{
		path: "config.billing_units",
		read: (p) => UsagePriceConfigSchema.parse(p.config).billing_units ?? 1,
	},
	{
		path: "config.threshold_billing.threshold",
		read: (p) =>
			UsagePriceConfigSchema.parse(p.config).threshold_billing?.threshold ??
			null,
	},
	{ path: "config.interval", read: (p) => p.config.interval },
	{ path: "config.interval_count", read: (p) => p.config.interval_count ?? 1 },
	{
		path: "config.internal_feature_id",
		read: (p) => p.config.internal_feature_id,
	},
	{ path: "config.feature_id", read: (p) => p.config.feature_id },
	{
		path: "config.usage_tiers",
		read: (p) =>
			usageTiersToComparisonShape(
				UsagePriceConfigSchema.parse(p.config).usage_tiers,
			),
	},
	{ path: "config.base_currency", read: (p) => p.config.base_currency ?? null },
	{ path: "config.currencies", read: currenciesShape },
	{
		path: "proration_config.on_increase",
		read: (p) => p.proration_config?.on_increase ?? null,
	},
	{
		path: "proration_config.on_decrease",
		read: (p) => p.proration_config?.on_decrease ?? null,
	},
	{
		path: "tier_behavior",
		read: (p) =>
			UsagePriceConfigSchema.parse(p.config).usage_tiers.length <= 1
				? "(flat)"
				: (p.tier_behavior ?? TierBehavior.Graduated),
	},
];

/** The same fields `pricesAreSame` compares, reported by name. */
export const describePriceDifferences = ({
	stored,
	desired,
}: {
	stored: Price;
	desired: Price;
}): RowDifference[] => {
	if (stored.config.type !== desired.config.type) {
		return [
			{
				path: "config.type",
				stored: stored.config.type,
				desired: desired.config.type,
			},
		];
	}
	const probes =
		stored.config.type === PriceType.Fixed ? fixedProbes : usageProbes;
	return collect({ stored, desired, probes });
};
