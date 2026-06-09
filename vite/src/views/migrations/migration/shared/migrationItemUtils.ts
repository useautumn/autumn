import type {
	Feature,
	ProductItem,
	ProductItemInterval,
	UsageTier,
} from "@autumn/shared";
import {
	BillingMethod,
	Infinite,
	ProductItemFeatureType,
	TierBehavior,
	UsageModel,
} from "@autumn/shared";
import { getDefaultItem } from "@/views/products/plan/utils/getDefaultItem";

const BOOLEAN_TYPES = new Set<string>([
	ProductItemFeatureType.Static,
	ProductItemFeatureType.Boolean,
]);

type MigrationPrice = {
	amount?: number;
	tiers?: UsageTier[];
	tier_behavior?: TierBehavior;
	interval?: string;
	interval_count?: number;
	billing_units?: number;
	billing_method?: BillingMethod;
	max_purchase?: number | null;
};

const usageModelToBillingMethod = (usageModel?: UsageModel | null) =>
	usageModel === UsageModel.Prepaid
		? BillingMethod.Prepaid
		: BillingMethod.UsageBased;

const billingMethodToUsageModel = (billingMethod?: BillingMethod) =>
	billingMethod === BillingMethod.Prepaid
		? UsageModel.Prepaid
		: UsageModel.PayPerUse;

const shiftTierIncluded = (
	tier: UsageTier,
	included: number,
	direction: 1 | -1,
) => ({
	...tier,
	to:
		typeof tier.to === "number" && tier.to > 0
			? tier.to + included * direction
			: tier.to,
});

export function migrationItemToProductItem(
	migItem: Record<string, unknown>,
	features: Feature[],
): ProductItem {
	const featureId = migItem.feature_id as string | undefined;
	const feature = featureId ? features.find((f) => f.id === featureId) : null;
	const base = feature
		? (getDefaultItem({ feature }) as ProductItem)
		: ({ feature_id: featureId } as ProductItem);

	const isBooleanItem = BOOLEAN_TYPES.has(base.feature_type as string);

	const price = migItem.price as MigrationPrice | undefined;
	const hasPrice = !!price;
	const included =
		migItem.included !== undefined ? Number(migItem.included) : 0;

	if (!isBooleanItem) {
		if (migItem.unlimited === true) {
			base.included_usage = Infinite;
			base.interval = null;
		} else if (migItem.included !== undefined) {
			base.included_usage = migItem.included as number;
		}
	}

	if (hasPrice) {
		base.tiers = price.tiers?.length
			? price.tiers.map((tier) => shiftTierIncluded(tier, included, -1))
			: [{ to: "inf", amount: Number(price.amount ?? 0) }];
		base.interval =
			price.interval && price.interval !== "one_off"
				? (price.interval as ProductItemInterval)
				: null;
		base.interval_count = price.interval_count;
		base.usage_model = billingMethodToUsageModel(price.billing_method);
		base.billing_units = price.billing_units ?? 1;
		base.tier_behavior = price.tier_behavior ?? TierBehavior.Graduated;
		base.usage_limit =
			price.max_purchase == null ? null : included + price.max_purchase;
	} else {
		const reset = migItem.reset as Record<string, unknown> | undefined;
		if (reset?.interval) {
			base.interval = reset.interval as ProductItemInterval;
			base.interval_count = reset.interval_count as number | undefined;
		}
	}
	return base;
}

export function productItemToMigrationItem(
	item: ProductItem,
): Record<string, unknown> {
	const result: Record<string, unknown> = { feature_id: item.feature_id };
	if (item.included_usage !== null && item.included_usage !== undefined) {
		if (item.included_usage === Infinite) {
			result.unlimited = true;
		} else {
			result.included = Number(item.included_usage);
		}
	}
	const included = result.included ? Number(result.included) : 0;
	if (item.tiers?.length) {
		const tiers = item.tiers.map((tier) =>
			shiftTierIncluded(tier, included, 1),
		);
		result.price = {
			...(tiers.length > 1
				? {
						tiers,
						tier_behavior: item.tier_behavior ?? TierBehavior.Graduated,
					}
				: { amount: tiers[0].amount ?? 0 }),
			interval: item.interval ?? "one_off",
			...(item.interval_count && item.interval_count !== 1
				? { interval_count: item.interval_count }
				: {}),
			billing_units: item.billing_units ?? 1,
			billing_method: usageModelToBillingMethod(item.usage_model),
			max_purchase:
				item.usage_limit == null ? null : item.usage_limit - included,
		};
	} else if (item.interval) {
		result.reset = { interval: item.interval };
	}
	return result;
}
