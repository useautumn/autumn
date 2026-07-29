import { expect, test } from "bun:test";
import {
	AllowanceType,
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

const candidateEntitlement: Entitlement = {
	id: "ent_candidate",
	org_id: "org_test",
	created_at: 1,
	is_custom: false,
	internal_product_id: "prod_latest",
	internal_feature_id: "fe_ai_credits",
	feature_id: "ai_credits",
	allowance: 0,
	allowance_type: AllowanceType.Fixed,
	interval: EntInterval.Month,
	interval_count: 1,
	carry_from_previous: false,
	entity_feature_id: null,
	usage_limit: null,
	rollover: null,
};

const targetEntitlement: Entitlement = {
	...candidateEntitlement,
	id: "ent_prepared",
	internal_product_id: "prod_prepared",
	entity_feature_id: undefined,
};

const candidatePrice: Price = {
	id: "pr_latest",
	org_id: "org_test",
	created_at: 1,
	internal_product_id: "prod_latest",
	is_custom: false,
	entitlement_id: candidateEntitlement.id,
	proration_config: null,
	tier_behavior: null,
	config: {
		type: PriceType.Usage,
		bill_when: BillWhen.StartOfPeriod,
		billing_units: 1,
		should_prorate: false,
		internal_feature_id: "fe_ai_credits",
		feature_id: "ai_credits",
		usage_tiers: [
			{ to: 1_000, amount: 10 },
			{ to: TierInfinite, amount: 11_400 },
		],
		interval: BillingInterval.Month,
		interval_count: 1,
		stripe_product_id: "prod_ai_credits",
		stripe_price_id: "price_old_ladder",
		stripe_prepaid_price_v2_id: "price_v2_old_ladder",
	} as UsagePriceConfig,
};

const targetPrice: Price = {
	...candidatePrice,
	id: "pr_prepared",
	internal_product_id: "prod_prepared",
	entitlement_id: targetEntitlement.id,
	config: {
		...candidatePrice.config,
		usage_tiers: [
			{ to: 1_000, amount: 10 },
			{ to: TierInfinite, amount: 20_000 },
		],
		stripe_product_id: undefined,
		stripe_price_id: undefined,
		stripe_prepaid_price_v2_id: undefined,
	} as UsagePriceConfig,
};

const blankEntityScopes = [undefined, null, ""] as const;

const withEntityScope = <T extends Entitlement>({
	entitlement,
	entityFeatureId,
}: {
	entitlement: T;
	entityFeatureId: (typeof blankEntityScopes)[number];
}) => ({
	...entitlement,
	entity_feature_id: entityFeatureId,
});

test("stripe reuse: blank entity scopes still reuse the Stripe product", () => {
	for (const targetScope of blankEntityScopes) {
		for (const candidateScope of blankEntityScopes) {
			const preparedPrice = structuredClone(targetPrice) as Price;

			const { copiedFields } = copyStripeResourcesToMatchingPrice({
				targetPrice: preparedPrice,
				candidatePrices: [candidatePrice],
				targetEntitlements: [
					withEntityScope({
						entitlement: targetEntitlement,
						entityFeatureId: targetScope,
					}),
				],
				candidateEntitlements: [
					withEntityScope({
						entitlement: candidateEntitlement,
						entityFeatureId: candidateScope,
					}),
				],
			});

			expect(copiedFields).toEqual(["stripe_product_id"]);
			const config = preparedPrice.config as UsagePriceConfig;
			expect(config.stripe_product_id).toBe("prod_ai_credits");
			expect(config.stripe_price_id).toBeUndefined();
			expect(config.stripe_prepaid_price_v2_id).toBeUndefined();
		}
	}
});

test("stripe reuse: blank entity scopes allow full reuse when the price matches", () => {
	for (const targetScope of blankEntityScopes) {
		for (const candidateScope of blankEntityScopes) {
			const preparedPrice = {
				...structuredClone(candidatePrice),
				id: "pr_prepared",
				internal_product_id: targetEntitlement.internal_product_id,
				entitlement_id: targetEntitlement.id,
				config: {
					...candidatePrice.config,
					stripe_product_id: undefined,
					stripe_price_id: undefined,
					stripe_prepaid_price_v2_id: undefined,
				} as UsagePriceConfig,
			} as Price;

			const { copiedFields } = copyStripeResourcesToMatchingPrice({
				targetPrice: preparedPrice,
				candidatePrices: [candidatePrice],
				targetEntitlements: [
					withEntityScope({
						entitlement: targetEntitlement,
						entityFeatureId: targetScope,
					}),
				],
				candidateEntitlements: [
					withEntityScope({
						entitlement: candidateEntitlement,
						entityFeatureId: candidateScope,
					}),
				],
			});

			expect(copiedFields).toEqual([
				"stripe_product_id",
				"stripe_price_id",
				"stripe_prepaid_price_v2_id",
			]);
			const config = preparedPrice.config as UsagePriceConfig;
			expect(config.stripe_product_id).toBe("prod_ai_credits");
			expect(config.stripe_price_id).toBe("price_old_ladder");
			expect(config.stripe_prepaid_price_v2_id).toBe("price_v2_old_ladder");
		}
	}
});
