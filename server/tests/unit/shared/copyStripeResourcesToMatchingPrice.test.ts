import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	AppEnv,
	BillingInterval,
	BillWhen,
	copyStripeResourcesToMatchingPrice,
	EntInterval,
	type Entitlement,
	type Price,
	PriceType,
	TierInfinite,
	type UsagePriceConfig,
} from "@autumn/shared";

const orgId = "org_copy";
const internalProductId = "prod_internal_copy";
const now = 1_800_000_000_000;

const baseConfig: UsagePriceConfig = {
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

const candidate = (overrides: Partial<Price> = {}): Price => ({
	id: "pr_existing",
	org_id: orgId,
	created_at: now,
	internal_product_id: internalProductId,
	is_custom: false,
	config: { ...baseConfig },
	entitlement_id: "ent_existing",
	proration_config: null,
	tier_behavior: null,
	...overrides,
});

const target = (overrides: Partial<Price> = {}): Price => ({
	id: "pr_new",
	org_id: orgId,
	created_at: now,
	internal_product_id: internalProductId,
	is_custom: false,
	config: {
		...baseConfig,
		stripe_product_id: undefined,
		stripe_price_id: undefined,
		stripe_meter_id: undefined,
		stripe_event_name: undefined,
	} as UsagePriceConfig,
	entitlement_id: "ent_new",
	proration_config: null,
	tier_behavior: null,
	...overrides,
});

const entitlement = (overrides: Partial<Entitlement> = {}): Entitlement => ({
	id: "ent_existing",
	org_id: orgId,
	created_at: now,
	is_custom: false,
	internal_product_id: internalProductId,
	internal_feature_id: baseConfig.internal_feature_id!,
	feature_id: baseConfig.feature_id!,
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

describe("copyStripeResourcesToMatchingPrice", () => {
	test("prefers a full match over a stripeProductOnly match", () => {
		const fullCandidate = candidate({ id: "pr_full" });
		const productOnlyCandidate = candidate({
			id: "pr_cheaper",
			config: {
				...baseConfig,
				usage_tiers: [{ amount: 0.05, to: TierInfinite }],
				stripe_product_id: "prod_other_credits",
				stripe_price_id: "price_other_credits",
			},
			entitlement_id: "ent_existing_cheaper",
		});
		const newPrice = target();

		const result = copyStripeResourcesToMatchingPrice({
			targetPrice: newPrice,
			candidatePrices: [productOnlyCandidate, fullCandidate],
			targetEntitlements: [entitlement({ id: "ent_new" })],
			candidateEntitlements: [
				entitlement(),
				entitlement({
					id: "ent_existing_cheaper",
					allowance: 200,
				}),
			],
		});

		const config = newPrice.config as UsagePriceConfig;
		expect(result.copiedFields).toContain("stripe_product_id");
		expect(config.stripe_product_id).toBe("prod_ai_credits");
		expect(config.stripe_price_id).toBe("price_ai_credits");
		expect(config.stripe_meter_id).toBe("meter_ai_credits");
		expect(config.stripe_event_name).toBe("ai_credits_used");
	});

	test("copies only stripe_product_id from a stripeProductOnly match", () => {
		const productOnlyCandidate = candidate({
			id: "pr_cheaper",
			config: {
				...baseConfig,
				usage_tiers: [{ amount: 0.05, to: TierInfinite }],
				stripe_product_id: "prod_other_credits",
				stripe_price_id: "price_other_credits",
				stripe_meter_id: "meter_other_credits",
			},
		});
		const newPrice = target();

		const result = copyStripeResourcesToMatchingPrice({
			targetPrice: newPrice,
			candidatePrices: [productOnlyCandidate],
			targetEntitlements: [entitlement({ id: "ent_new" })],
			candidateEntitlements: [entitlement()],
		});

		const config = newPrice.config as UsagePriceConfig;
		expect(result.copiedFields).toEqual(["stripe_product_id"]);
		expect(config.stripe_product_id).toBe("prod_other_credits");
		expect(config.stripe_price_id).toBeUndefined();
		expect(config.stripe_meter_id).toBeUndefined();
	});

	test("returns no copied fields when nothing matches", () => {
		const unrelatedCandidate = candidate({
			id: "pr_unrelated",
			config: {
				...baseConfig,
				feature_id: "other_feature",
				internal_feature_id: "feat_internal_other",
			},
		});

		const newPrice = target();
		const result = copyStripeResourcesToMatchingPrice({
			targetPrice: newPrice,
			candidatePrices: [unrelatedCandidate],
			targetEntitlements: [entitlement({ id: "ent_new" })],
			candidateEntitlements: [entitlement()],
		});

		const config = newPrice.config as UsagePriceConfig;
		expect(result.copiedFields).toEqual([]);
		expect(config.stripe_product_id).toBeUndefined();
	});
});
