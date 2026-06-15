import type { ApiFeatureV1 } from "@api/features/apiFeatureV1.js";
import { BillingMethod } from "@api/products/components/billingMethod.js";
import type { ApiPlanItemV1 } from "@api/products/items/apiPlanItemV1.js";
import { FeatureType } from "@models/featureModels/featureEnums.js";
import { RolloverExpiryDurationType } from "@models/productModels/durationTypes/rolloverExpiryDurationType.js";
import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import { ResetInterval } from "@models/productModels/intervals/resetInterval.js";
import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig.js";

type PlanItemPrice = NonNullable<ApiPlanItemV1["price"]>;
type Rollover = NonNullable<ApiPlanItemV1["rollover"]>;
type UsageTier = NonNullable<PlanItemPrice["tiers"]>[number];

const resetInterval = {
	month: ResetInterval.Month,
	year: ResetInterval.Year,
} as const;

const billingInterval = {
	month: BillingInterval.Month,
	year: BillingInterval.Year,
} as const;

const defaultCreditTiers: UsageTier[] = [
	{ to: 10_000, amount: 0, flat_amount: 100 },
	{ to: 50_000, amount: 0, flat_amount: 400 },
	{ to: 100_000, amount: 0, flat_amount: 750 },
	{ to: "inf", amount: 0, flat_amount: 1_000 },
];

const defaultRollover: Rollover = {
	expiry_duration_length: 1,
	expiry_duration_type: RolloverExpiryDurationType.Month,
	max: null,
	max_percentage: 50,
};

const assertFeatureType = ({
	feature,
	expected,
	item,
}: {
	feature: ApiFeatureV1;
	expected: ApiFeatureV1["type"] | ApiFeatureV1["type"][];
	item: string;
}) => {
	const expectedTypes = Array.isArray(expected) ? expected : [expected];
	if (expectedTypes.includes(feature.type)) return;

	throw new Error(
		`${item} item requires ${expectedTypes.join(" or ")} feature, got ${feature.type} (${feature.id}).`,
	);
};

/** Plan item fixtures validate feature compatibility to avoid impossible setups. */
export const items = {
	boolean: ({ feature }: { feature: ApiFeatureV1 }): ApiPlanItemV1 => {
		assertFeatureType({
			expected: FeatureType.Boolean,
			feature,
			item: "boolean",
		});

		return {
			display: {
				primary_text: feature.name,
			},
			feature_id: feature.id,
			included: 1,
			price: null,
			reset: null,
			unlimited: true,
		};
	},
	included: ({
		feature,
		included = 0,
		interval = feature.consumable ? "month" : null,
	}: {
		feature: ApiFeatureV1;
		included?: number;
		interval?: "month" | "year" | null;
	}): ApiPlanItemV1 => {
		assertFeatureType({
			expected: [FeatureType.Metered, FeatureType.CreditSystem],
			feature,
			item: "included",
		});

		return {
			display: {
				primary_text: `${included.toLocaleString()} ${feature.name}`,
				secondary_text: interval ? `resets every ${interval}` : undefined,
			},
			feature_id: feature.id,
			included,
			price: null,
			reset: interval ? { interval: resetInterval[interval] } : null,
			unlimited: false,
		};
	},
	prepaidCredits: ({
		feature,
		included = 5_000,
		interval = "month",
		rollover = defaultRollover,
		tiers = defaultCreditTiers,
	}: {
		feature: ApiFeatureV1;
		included?: number;
		interval?: "month" | "year";
		rollover?: Rollover;
		tiers?: UsageTier[];
	}): ApiPlanItemV1 => {
		assertFeatureType({
			expected: FeatureType.CreditSystem,
			feature,
			item: "prepaidCredits",
		});

		return {
			display: {
				primary_text: `${included.toLocaleString()} ${feature.name}`,
				secondary_text: "then prepaid volume tiers",
			},
			feature_id: feature.id,
			included,
			price: {
				billing_method: BillingMethod.Prepaid,
				billing_units: 1,
				interval: billingInterval[interval],
				max_purchase: null,
				tier_behavior: TierBehavior.VolumeBased,
				tiers,
			},
			reset: { interval: resetInterval[interval] },
			rollover,
			unlimited: false,
		};
	},
	consumableCredits: ({
		amount = 0.01,
		feature,
		interval = "month",
		rollover = defaultRollover,
	}: {
		amount?: number;
		feature: ApiFeatureV1;
		interval?: "month" | "year";
		rollover?: Rollover;
	}): ApiPlanItemV1 => {
		assertFeatureType({
			expected: FeatureType.CreditSystem,
			feature,
			item: "consumableCredits",
		});

		return {
			display: {
				primary_text: `$${amount} per ${feature.name}`,
			},
			feature_id: feature.id,
			included: 0,
			price: {
				amount,
				billing_method: BillingMethod.UsageBased,
				billing_units: 1,
				interval: billingInterval[interval],
				max_purchase: null,
			},
			reset: { interval: resetInterval[interval] },
			rollover,
			unlimited: false,
		};
	},
} as const;
