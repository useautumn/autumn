import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	composeMatchKey,
	createPlanItemToKey,
	Infinite,
	OnDecrease,
	OnIncrease,
	ResetInterval,
	RolloverExpiryDurationType,
	TierBehavior,
} from "@autumn/shared";
import type { CreatePlanItemParamsV1 } from "@autumn/shared/api/products/items/crud/createPlanItemParamsV1";

const usagePrice = {
	amount: 1,
	interval: BillingInterval.Month,
	billing_method: BillingMethod.UsageBased,
};

const item = (overrides: Record<string, unknown> = {}) =>
	({
		feature_id: "messages",
		...overrides,
	}) as CreatePlanItemParamsV1;

const priced = (priceOverrides: Record<string, unknown> = {}) =>
	item({ price: { ...usagePrice, ...priceOverrides } });

const keyOf = (value: CreatePlanItemParamsV1) =>
	createPlanItemToKey({ item: value });

const expectSame = (
	a: CreatePlanItemParamsV1,
	b: CreatePlanItemParamsV1,
	expected: boolean,
) => {
	expect(keyOf(a) === keyOf(b)).toBe(expected);
	expect(keyOf(b) === keyOf(a)).toBe(expected);
};

describe("createPlanItemToKey", () => {
	test("identical baselines are same", () => {
		expectSame(item(), item(), true);
		expectSame(priced(), priced(), true);
	});

	describe("feature_id (strict)", () => {
		test("equal ids are same, different ids differ", () => {
			expectSame(item({ feature_id: "messages" }), item({ feature_id: "messages" }), true);
			expectSame(item({ feature_id: "messages" }), item({ feature_id: "seats" }), false);
		});

		test("comparison is case-sensitive", () => {
			expectSame(item({ feature_id: "messages" }), item({ feature_id: "Messages" }), false);
		});
	});

	describe("entity_feature_id (empty string / null / unset collapse)", () => {
		test("equal ids are same, different ids differ", () => {
			expectSame(
				item({ entity_feature_id: "org" }),
				item({ entity_feature_id: "org" }),
				true,
			);
			expectSame(
				item({ entity_feature_id: "org" }),
				item({ entity_feature_id: "user" }),
				false,
			);
		});

		test("empty string, null, and undefined are all same", () => {
			expectSame(item({ entity_feature_id: "" }), item({ entity_feature_id: null }), true);
			expectSame(
				item({ entity_feature_id: "" }),
				item({ entity_feature_id: undefined }),
				true,
			);
			expectSame(
				item({ entity_feature_id: null }),
				item({ entity_feature_id: undefined }),
				true,
			);
			expectSame(item(), item({ entity_feature_id: "" }), true);
		});

		test("collapsed empty vs a real id differ", () => {
			expectSame(item({ entity_feature_id: "" }), item({ entity_feature_id: "org" }), false);
			expectSame(item({ entity_feature_id: null }), item({ entity_feature_id: "org" }), false);
		});
	});

	describe("pooled (unset means false)", () => {
		test("true vs false differ", () => {
			expectSame(item({ pooled: true }), item({ pooled: false }), false);
		});

		test("unset / null equal false; unset vs true differ", () => {
			expectSame(item({ pooled: undefined }), item({ pooled: false }), true);
			expectSame(item({ pooled: null }), item({ pooled: false }), true);
			expectSame(item({ pooled: null }), item({ pooled: undefined }), true);
			expectSame(item(), item({ pooled: false }), true);
			expectSame(item({ pooled: undefined }), item({ pooled: true }), false);
		});
	});

	describe("included (unset / null means 0)", () => {
		test("equal values are same, different values differ", () => {
			expectSame(item({ included: 100 }), item({ included: 100 }), true);
			expectSame(item({ included: 100 }), item({ included: 200 }), false);
		});

		test("unset and null equal 0", () => {
			expectSame(item({ included: undefined }), item({ included: 0 }), true);
			expectSame(item({ included: null }), item({ included: 0 }), true);
			expectSame(item({ included: null }), item({ included: undefined }), true);
			expectSame(item(), item({ included: 0 }), true);
		});

		test("0 vs a real allowance differ", () => {
			expectSame(item({ included: 0 }), item({ included: 100 }), false);
			expectSame(item({ included: null }), item({ included: 100 }), false);
		});
	});

	describe("unlimited (unset means false)", () => {
		test("true vs false differ; unset / null equal false", () => {
			expectSame(item({ unlimited: true }), item({ unlimited: false }), false);
			expectSame(item({ unlimited: undefined }), item({ unlimited: false }), true);
			expectSame(item({ unlimited: null }), item({ unlimited: false }), true);
			expectSame(item(), item({ unlimited: false }), true);
			expectSame(item({ unlimited: undefined }), item({ unlimited: true }), false);
		});
	});

	describe("reset.interval", () => {
		test("equal intervals are same, different intervals differ", () => {
			expectSame(
				item({ reset: { interval: ResetInterval.Month } }),
				item({ reset: { interval: ResetInterval.Month } }),
				true,
			);
			expectSame(
				item({ reset: { interval: ResetInterval.Month } }),
				item({ reset: { interval: ResetInterval.Year } }),
				false,
			);
		});

		test("missing reset vs reset with an interval differ", () => {
			expectSame(item(), item({ reset: { interval: ResetInterval.Month } }), false);
		});
	});

	describe("reset.interval_count (unset means 1)", () => {
		test("unset equals 1 when reset is present", () => {
			expectSame(
				item({ reset: { interval: ResetInterval.Month } }),
				item({ reset: { interval: ResetInterval.Month, interval_count: 1 } }),
				true,
			);
			expectSame(
				item({ reset: { interval: ResetInterval.Month, interval_count: null } }),
				item({ reset: { interval: ResetInterval.Month, interval_count: 1 } }),
				true,
			);
		});

		test("1 vs 2 differ", () => {
			expectSame(
				item({ reset: { interval: ResetInterval.Month, interval_count: 1 } }),
				item({ reset: { interval: ResetInterval.Month, interval_count: 2 } }),
				false,
			);
		});

		test("0 is preserved (not collapsed to 1)", () => {
			expectSame(
				item({ reset: { interval: ResetInterval.Month, interval_count: 0 } }),
				item({ reset: { interval: ResetInterval.Month, interval_count: 1 } }),
				false,
			);
		});
	});

	describe("price presence", () => {
		test("omitted and null price are same", () => {
			expectSame(item(), item({ price: null }), true);
			expectSame(item({ price: undefined }), item({ price: null }), true);
		});

		test("null / omitted vs a real price differ", () => {
			expectSame(item(), priced(), false);
			expectSame(item({ price: null }), priced(), false);
		});
	});

	describe("price.amount (unset / null collapse; 0 is preserved)", () => {
		test("equal amounts are same, different amounts differ", () => {
			expectSame(priced({ amount: 1 }), priced({ amount: 1 }), true);
			expectSame(priced({ amount: 1 }), priced({ amount: 2 }), false);
		});

		test("null and undefined are same; 0 is not nullish", () => {
			expectSame(priced({ amount: null }), priced({ amount: undefined }), true);
			expectSame(priced({ amount: 0 }), priced({ amount: 0 }), true);
			expectSame(priced({ amount: 0 }), priced({ amount: null }), false);
			expectSame(priced({ amount: 0 }), priced({ amount: undefined }), false);
			expectSame(priced({ amount: 0 }), priced({ amount: 1 }), false);
		});
	});

	describe("price.interval (strict)", () => {
		test("equal intervals are same, different intervals differ", () => {
			expectSame(
				priced({ interval: BillingInterval.Month }),
				priced({ interval: BillingInterval.Month }),
				true,
			);
			expectSame(
				priced({ interval: BillingInterval.Month }),
				priced({ interval: BillingInterval.Year }),
				false,
			);
		});
	});

	describe("price.billing_method (strict)", () => {
		test("equal methods are same, different methods differ", () => {
			expectSame(
				priced({ billing_method: BillingMethod.UsageBased }),
				priced({ billing_method: BillingMethod.UsageBased }),
				true,
			);
			expectSame(
				priced({ billing_method: BillingMethod.UsageBased }),
				priced({ billing_method: BillingMethod.Prepaid }),
				false,
			);
		});
	});

	describe("price.interval_count (unset means 1)", () => {
		test("unset / null equal 1; 1 vs 2 differ", () => {
			expectSame(priced({ interval_count: undefined }), priced({ interval_count: 1 }), true);
			expectSame(priced({ interval_count: null }), priced({ interval_count: 1 }), true);
			expectSame(priced(), priced({ interval_count: 1 }), true);
			expectSame(priced({ interval_count: 1 }), priced({ interval_count: 2 }), false);
			expectSame(priced({ interval_count: undefined }), priced({ interval_count: 2 }), false);
		});

		test("0 is preserved (not collapsed to 1)", () => {
			expectSame(priced({ interval_count: 0 }), priced({ interval_count: 1 }), false);
		});
	});

	describe("price.billing_units (unset means 1)", () => {
		test("unset / null equal 1; 1 vs 100 differ", () => {
			expectSame(priced({ billing_units: undefined }), priced({ billing_units: 1 }), true);
			expectSame(priced({ billing_units: null }), priced({ billing_units: 1 }), true);
			expectSame(priced(), priced({ billing_units: 1 }), true);
			expectSame(priced({ billing_units: 1 }), priced({ billing_units: 100 }), false);
		});

		test("0 is preserved (not collapsed to 1)", () => {
			expectSame(priced({ billing_units: 0 }), priced({ billing_units: 1 }), false);
		});
	});

	describe("price.max_purchase (unset / null collapse; 0 is preserved)", () => {
		test("unset, null, and undefined are same", () => {
			expectSame(priced(), priced({ max_purchase: null }), true);
			expectSame(priced({ max_purchase: undefined }), priced({ max_purchase: null }), true);
		});

		test("a limit vs unset differ; 0 is not nullish", () => {
			expectSame(priced({ max_purchase: 10 }), priced(), false);
			expectSame(priced({ max_purchase: 10 }), priced({ max_purchase: 20 }), false);
			expectSame(priced({ max_purchase: 0 }), priced({ max_purchase: 0 }), true);
			expectSame(priced({ max_purchase: 0 }), priced({ max_purchase: null }), false);
			expectSame(priced({ max_purchase: 0 }), priced(), false);
		});
	});

	describe("price.additional_currencies", () => {
		test("omitted, null, and empty are same", () => {
			expectSame(priced(), priced({ additional_currencies: [] }), true);
			expectSame(priced({ additional_currencies: null }), priced({ additional_currencies: [] }), true);
		});

		test("present vs absent differ; amounts differ", () => {
			expectSame(
				priced({ additional_currencies: [{ currency: "eur", amount: 1 }] }),
				priced(),
				false,
			);
			expectSame(
				priced({ additional_currencies: [{ currency: "eur", amount: 1 }] }),
				priced({ additional_currencies: [{ currency: "eur", amount: 2 }] }),
				false,
			);
		});

		test("0 amount is preserved (not collapsed to omitted)", () => {
			expectSame(
				priced({ additional_currencies: [{ currency: "eur", amount: 0 }] }),
				priced({ additional_currencies: [{ currency: "eur", amount: null }] }),
				false,
			);
			expectSame(
				priced({ additional_currencies: [{ currency: "eur", amount: 0 }] }),
				priced({ additional_currencies: [{ currency: "eur" }] }),
				false,
			);
		});

		test("order does not matter; currency code is case-insensitive", () => {
			expectSame(
				priced({
					additional_currencies: [
						{ currency: "eur", amount: 1 },
						{ currency: "gbp", amount: 2 },
					],
				}),
				priced({
					additional_currencies: [
						{ currency: "gbp", amount: 2 },
						{ currency: "eur", amount: 1 },
					],
				}),
				true,
			);
			expectSame(
				priced({ additional_currencies: [{ currency: "EUR", amount: 1 }] }),
				priced({ additional_currencies: [{ currency: "eur", amount: 1 }] }),
				true,
			);
		});
	});

	describe("price.tiers", () => {
		test("omitted and empty are same; empty vs a tier differ", () => {
			expectSame(priced(), priced({ tiers: [] }), true);
			expectSame(
				priced({ amount: undefined, tiers: [{ to: 100, amount: 1 }] }),
				priced({ amount: undefined, tiers: [] }),
				false,
			);
		});

		test("to / amount / flat_amount differences", () => {
			const base = priced({ amount: undefined, tiers: [{ to: 100, amount: 1 }] });
			expectSame(
				base,
				priced({ amount: undefined, tiers: [{ to: 100, amount: 1 }] }),
				true,
			);
			expectSame(
				base,
				priced({ amount: undefined, tiers: [{ to: 200, amount: 1 }] }),
				false,
			);
			expectSame(
				base,
				priced({ amount: undefined, tiers: [{ to: 100, amount: 2 }] }),
				false,
			);
			expectSame(
				base,
				priced({ amount: undefined, tiers: [{ to: 100, amount: 1, flat_amount: 5 }] }),
				false,
			);
		});

		test("tier amount unset equals 0; 0 vs a real amount differ", () => {
			expectSame(
				priced({ amount: undefined, tiers: [{ to: 100 }] }),
				priced({ amount: undefined, tiers: [{ to: 100, amount: 0 }] }),
				true,
			);
			expectSame(
				priced({ amount: undefined, tiers: [{ to: 100, amount: 0 }] }),
				priced({ amount: undefined, tiers: [{ to: 100, amount: 1 }] }),
				false,
			);
		});

		test("tier flat_amount: unset / null collapse; 0 is preserved", () => {
			expectSame(
				priced({ amount: undefined, tiers: [{ to: 100, amount: 1 }] }),
				priced({
					amount: undefined,
					tiers: [{ to: 100, amount: 1, flat_amount: null }],
				}),
				true,
			);
			expectSame(
				priced({
					amount: undefined,
					tiers: [{ to: 100, amount: 1, flat_amount: 0 }],
				}),
				priced({
					amount: undefined,
					tiers: [{ to: 100, amount: 1, flat_amount: null }],
				}),
				false,
			);
		});

		test("tier order is significant", () => {
			expectSame(
				priced({
					amount: undefined,
					tiers: [
						{ to: 100, amount: 1 },
						{ to: Infinite, amount: 0.5 },
					],
				}),
				priced({
					amount: undefined,
					tiers: [
						{ to: Infinite, amount: 0.5 },
						{ to: 100, amount: 1 },
					],
				}),
				false,
			);
		});

		test("tier additional_currencies present vs absent", () => {
			expectSame(
				priced({
					amount: undefined,
					tiers: [
						{
							to: 100,
							amount: 1,
							additional_currencies: [{ currency: "eur", amount: 2 }],
						},
					],
				}),
				priced({ amount: undefined, tiers: [{ to: 100, amount: 1 }] }),
				false,
			);
		});
	});

	describe("price.tier_behavior (only when tiers exist; unset means graduated)", () => {
		test("without tiers, behavior is ignored", () => {
			expectSame(
				priced({ tier_behavior: TierBehavior.Graduated }),
				priced({ tier_behavior: TierBehavior.VolumeBased }),
				true,
			);
			expectSame(priced(), priced({ tier_behavior: TierBehavior.VolumeBased }), true);
		});

		test("with tiers, unset equals graduated; graduated vs volume differ", () => {
			const tiers = [{ to: 100, amount: 1 }];
			expectSame(
				priced({ amount: undefined, tiers }),
				priced({
					amount: undefined,
					tiers,
					tier_behavior: TierBehavior.Graduated,
				}),
				true,
			);
			expectSame(
				priced({
					amount: undefined,
					tiers,
					tier_behavior: TierBehavior.Graduated,
				}),
				priced({
					amount: undefined,
					tiers,
					tier_behavior: TierBehavior.VolumeBased,
				}),
				false,
			);
		});
	});

	describe("price.stripe_price_id (ignored)", () => {
		test("different stripe ids are same", () => {
			expectSame(
				priced({ stripe_price_id: "price_a" }),
				priced({ stripe_price_id: "price_b" }),
				true,
			);
			expectSame(priced({ stripe_price_id: "price_a" }), priced(), true);
		});
	});

	describe("proration", () => {
		const prorate = {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.Prorate,
		};

		test("both absent are same; one-sided differs", () => {
			expectSame(item(), item({ proration: null }), true);
			expectSame(item(), item({ proration: prorate }), false);
		});

		test("on_increase / on_decrease differences", () => {
			expectSame(item({ proration: prorate }), item({ proration: { ...prorate } }), true);
			expectSame(
				item({ proration: prorate }),
				item({
					proration: {
						on_increase: OnIncrease.BillNextCycle,
						on_decrease: OnDecrease.Prorate,
					},
				}),
				false,
			);
			expectSame(
				item({ proration: prorate }),
				item({
					proration: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.None,
					},
				}),
				false,
			);
		});
	});

	describe("rollover", () => {
		const month = {
			expiry_duration_type: RolloverExpiryDurationType.Month,
		};

		test("both absent are same; one-sided differs", () => {
			expectSame(item(), item({ rollover: null }), true);
			expectSame(item(), item({ rollover: month }), false);
		});

		test("expiry_duration_type differences", () => {
			expectSame(
				item({ rollover: month }),
				item({
					rollover: { expiry_duration_type: RolloverExpiryDurationType.Forever },
				}),
				false,
			);
		});

		test("max: unset / null collapse; 0 is preserved", () => {
			expectSame(
				item({ rollover: month }),
				item({ rollover: { ...month, max: null } }),
				true,
			);
			expectSame(
				item({ rollover: { ...month, max: 0 } }),
				item({ rollover: { ...month, max: null } }),
				false,
			);
			expectSame(
				item({ rollover: { ...month, max: 10 } }),
				item({ rollover: month }),
				false,
			);
		});

		test("max_percentage: unset / null collapse; 0 is preserved", () => {
			expectSame(
				item({ rollover: month }),
				item({ rollover: { ...month, max_percentage: null } }),
				true,
			);
			expectSame(
				item({ rollover: { ...month, max_percentage: 0 } }),
				item({ rollover: { ...month, max_percentage: null } }),
				false,
			);
			expectSame(
				item({ rollover: { ...month, max_percentage: 50 } }),
				item({ rollover: month }),
				false,
			);
		});

		test("expiry_duration_length: unset / null collapse; 0 is preserved", () => {
			expectSame(
				item({ rollover: month }),
				item({ rollover: { ...month, expiry_duration_length: null } }),
				true,
			);
			expectSame(
				item({ rollover: { ...month, expiry_duration_length: 0 } }),
				item({ rollover: { ...month, expiry_duration_length: null } }),
				false,
			);
			expectSame(
				item({ rollover: { ...month, expiry_duration_length: 2 } }),
				item({ rollover: month }),
				false,
			);
		});
	});

	describe("internal ids (ignored)", () => {
		test("entitlement_id and price_id do not affect the key", () => {
			expectSame(
				item({ entitlement_id: "ent_a", price_id: "pr_a" }),
				item({ entitlement_id: "ent_b", price_id: "pr_b" }),
				true,
			);
			expectSame(item({ entitlement_id: "ent_a" }), item(), true);
		});
	});
});

test("same slot, different included → same match key, different payload key", () => {
	const hundred = item({ included: 100 });
	const twoHundred = item({ included: 200 });
	expect(composeMatchKey(hundred)).toBe(composeMatchKey(twoHundred));
	expect(keyOf(hundred) === keyOf(twoHundred)).toBe(false);
});
