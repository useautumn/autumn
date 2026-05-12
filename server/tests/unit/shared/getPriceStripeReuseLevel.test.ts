import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	AppEnv,
	BillingInterval,
	BillWhen,
	EntInterval,
	type Entitlement,
	type FixedPriceConfig,
	getPriceStripeReuseLevel,
	PREVIEW_STRIPE_PRICE_ID_PREFIX,
	type Price,
	PriceType,
	TierInfinite,
	type UsagePriceConfig,
} from "@autumn/shared";

const orgId = "org_match";
const internalProductId = "prod_internal_match";
const now = 1_800_000_000_000;

const usageConfig: UsagePriceConfig = {
	type: PriceType.Usage,
	bill_when: BillWhen.EndOfPeriod,
	billing_units: 1,
	should_prorate: false,
	internal_feature_id: "feat_internal_ai_credits",
	feature_id: "ai_credits",
	usage_tiers: [{ amount: 0.1, to: TierInfinite }],
	interval: BillingInterval.Month,
	interval_count: 1,
	stripe_product_id: "prod_ai_credits",
	stripe_price_id: "price_ai_credits",
	stripe_meter_id: "meter_ai_credits",
	stripe_event_name: "ai_credits_used",
};

const usagePrice = (overrides: Partial<Price> = {}): Price => ({
	id: "pr_ai_credits",
	org_id: orgId,
	created_at: now,
	internal_product_id: internalProductId,
	is_custom: false,
	config: { ...usageConfig },
	entitlement_id: "ent_ai_credits",
	proration_config: null,
	tier_behavior: null,
	...overrides,
});

const entitlement = (overrides: Partial<Entitlement> = {}): Entitlement => ({
	id: "ent_ai_credits",
	org_id: orgId,
	created_at: now,
	is_custom: false,
	internal_product_id: internalProductId,
	internal_feature_id: usageConfig.internal_feature_id!,
	feature_id: usageConfig.feature_id!,
	allowance: 100,
	allowance_type: AllowanceType.Fixed,
	interval: EntInterval.Month,
	interval_count: 1,
	carry_from_previous: false,
	entity_feature_id: undefined,
	usage_limit: null,
	rollover: null,
	...overrides,
});

describe("getPriceStripeReuseLevel", () => {
	test("returns full when configs and paired entitlements match", () => {
		const level = getPriceStripeReuseLevel({
			newPrice: usagePrice({ id: "pr_new" }),
			candidatePrice: usagePrice(),
			newEntitlements: [entitlement()],
			candidateEntitlements: [entitlement()],
		});

		expect(level).toBe("full");
	});

	test("returns stripeProductOnly when config differs but feature scope matches", () => {
		const cheaper = usagePrice({
			id: "pr_cheaper",
			config: {
				...usageConfig,
				usage_tiers: [{ amount: 0.05, to: TierInfinite }],
			},
		});

		const level = getPriceStripeReuseLevel({
			newPrice: cheaper,
			candidatePrice: usagePrice(),
			newEntitlements: [entitlement()],
			candidateEntitlements: [entitlement()],
		});

		expect(level).toBe("stripeProductOnly");
	});

	test("returns none when entity scope differs", () => {
		const level = getPriceStripeReuseLevel({
			newPrice: usagePrice({
				id: "pr_new",
				entitlement_id: "ent_per_seat",
			}),
			candidatePrice: usagePrice(),
			newEntitlements: [
				entitlement({ id: "ent_per_seat", entity_feature_id: "seat" }),
			],
			candidateEntitlements: [entitlement()],
		});

		expect(level).toBe("none");
	});

	test("returns none when candidate has preview-only Stripe IDs", () => {
		const previewCandidate = usagePrice({
			config: {
				...usageConfig,
				stripe_product_id: `${PREVIEW_STRIPE_PRICE_ID_PREFIX}ai_credits`,
			},
		});

		const level = getPriceStripeReuseLevel({
			newPrice: usagePrice({ id: "pr_new" }),
			candidatePrice: previewCandidate,
			newEntitlements: [entitlement()],
			candidateEntitlements: [entitlement()],
		});

		expect(level).toBe("none");
	});

	test("returns full for matching fixed prices regardless of paired entitlements", () => {
		const fixed: Price = {
			id: "pr_base",
			org_id: orgId,
			created_at: now,
			internal_product_id: internalProductId,
			is_custom: false,
			config: {
				type: PriceType.Fixed,
				amount: 500,
				interval: BillingInterval.Month,
				interval_count: 1,
				stripe_product_id: null,
				feature_id: null,
				internal_feature_id: null,
				stripe_price_id: "price_fixed",
			} satisfies FixedPriceConfig,
			proration_config: null,
		};
		const fixedTarget: Price = {
			...fixed,
			id: "pr_base_new",
			config: {
				...(fixed.config as FixedPriceConfig),
				stripe_price_id: null,
			},
		};

		const level = getPriceStripeReuseLevel({
			newPrice: fixedTarget,
			candidatePrice: fixed,
			newEntitlements: [],
			candidateEntitlements: [],
		});

		expect(level).toBe("full");
	});
});
