import { describe, expect, test } from "bun:test";
import {
	AllocatedBillingBehavior,
	BillingInterval,
	BillWhen,
	type FixedPriceConfig,
	OnDecrease,
	OnIncrease,
	type Price,
	pricesAreSame,
	TierBehavior,
	TierInfinite,
	tiersAreSame,
	type UsagePriceConfig,
	type UsageTier,
} from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";

const fixed = (
	configOverrides: Record<string, unknown> = {},
	overrides: Record<string, unknown> = {},
) =>
	prices.buildFixed({
		configOverrides: configOverrides as Partial<FixedPriceConfig>,
		overrides: overrides as Partial<Price>,
	});

const usage = (
	configOverrides: Record<string, unknown> = {},
	overrides: Record<string, unknown> = {},
) =>
	prices.buildUsage({
		configOverrides: configOverrides as Partial<UsagePriceConfig>,
		overrides: overrides as Partial<Price>,
	});

const expectSame = (a: Price, b: Price, expected: boolean) => {
	expect(pricesAreSame(a, b)).toBe(expected);
	expect(pricesAreSame(b, a)).toBe(expected);
};

describe("pricesAreSame", () => {
	test("identical baselines are same", () => {
		expectSame(fixed(), fixed(), true);
		expectSame(usage(), usage(), true);
	});

	test("fixed vs usage config types differ", () => {
		expectSame(fixed(), usage(), false);
	});

	describe("fixed config", () => {
		test("amount", () => {
			expectSame(fixed({ amount: 10 }), fixed({ amount: 10 }), true);
			expectSame(fixed({ amount: 10 }), fixed({ amount: 11 }), false);
			expectSame(fixed({ amount: 0 }), fixed({ amount: 0 }), true);
		});

		test("interval", () => {
			expectSame(
				fixed({ interval: BillingInterval.Month }),
				fixed({ interval: BillingInterval.Year }),
				false,
			);
			expectSame(
				fixed({ interval: BillingInterval.OneOff }),
				fixed({ interval: BillingInterval.OneOff }),
				true,
			);
		});

		test("interval_count unset equals 1", () => {
			expectSame(
				fixed({ interval_count: undefined }),
				fixed({ interval_count: 1 }),
				true,
			);
			expectSame(
				fixed({ interval_count: undefined }),
				fixed({ interval_count: undefined }),
				true,
			);
			expectSame(
				fixed({ interval_count: undefined }),
				fixed({ interval_count: 2 }),
				false,
			);
			expectSame(
				fixed({ interval_count: 1 }),
				fixed({ interval_count: 2 }),
				false,
			);
		});

		test("base_currency: nullish collapses, values strict and case-sensitive", () => {
			expectSame(
				fixed({ base_currency: null }),
				fixed({ base_currency: undefined }),
				true,
			);
			expectSame(
				fixed({ base_currency: "usd" }),
				fixed({ base_currency: "usd" }),
				true,
			);
			expectSame(
				fixed({ base_currency: "usd" }),
				fixed({ base_currency: "eur" }),
				false,
			);
			expectSame(
				fixed({ base_currency: "USD" }),
				fixed({ base_currency: "usd" }),
				false,
			);
			expectSame(
				fixed({ base_currency: null }),
				fixed({ base_currency: "usd" }),
				false,
			);
		});

		test("fixed path ignores proration_config and tier_behavior", () => {
			expectSame(
				fixed(
					{},
					{
						proration_config: {
							on_increase: OnIncrease.ProrateImmediately,
							on_decrease: OnDecrease.ProrateImmediately,
						},
						tier_behavior: TierBehavior.VolumeBased,
					},
				),
				fixed({}, { proration_config: null, tier_behavior: null }),
				true,
			);
		});

		test("fixed path ignores stripe ids and billing_units", () => {
			expectSame(
				fixed({
					stripe_price_id: "price_a",
					stripe_product_id: "prod_a",
					billing_units: 1,
				}),
				fixed({
					stripe_price_id: "price_b",
					stripe_product_id: "prod_b",
					billing_units: 100,
				}),
				true,
			);
		});
	});

	describe("usage config — should_prorate (unset means false)", () => {
		test("true vs false differ", () => {
			expectSame(
				usage({ should_prorate: true }),
				usage({ should_prorate: false }),
				false,
			);
		});

		test("unset equals false", () => {
			expectSame(
				usage({ should_prorate: undefined }),
				usage({ should_prorate: false }),
				true,
			);
			expectSame(
				usage({ should_prorate: undefined }),
				usage({ should_prorate: undefined }),
				true,
			);
		});

		test("unset vs true differ", () => {
			expectSame(
				usage({ should_prorate: undefined }),
				usage({ should_prorate: true }),
				false,
			);
		});
	});

	describe("usage config — allocated_billing_behavior (unset derives from should_prorate)", () => {
		test("explicit equal values are same; different values differ", () => {
			expectSame(
				usage({ allocated_billing_behavior: AllocatedBillingBehavior.Arrear }),
				usage({ allocated_billing_behavior: AllocatedBillingBehavior.Arrear }),
				true,
			);
			expectSame(
				usage({
					allocated_billing_behavior: AllocatedBillingBehavior.Arrear,
				}),
				usage({
					allocated_billing_behavior: AllocatedBillingBehavior.Prorated,
				}),
				false,
			);
		});

		test("unset with should_prorate=false equals explicit arrear (allocated v1)", () => {
			expectSame(
				usage({
					should_prorate: false,
					allocated_billing_behavior: undefined,
				}),
				usage({
					should_prorate: false,
					allocated_billing_behavior: AllocatedBillingBehavior.Arrear,
				}),
				true,
			);
		});

		test("unset with should_prorate=true equals explicit prorated (allocated v1)", () => {
			expectSame(
				usage({
					should_prorate: true,
					allocated_billing_behavior: undefined,
				}),
				usage({
					should_prorate: true,
					allocated_billing_behavior: AllocatedBillingBehavior.Prorated,
				}),
				true,
			);
		});

		test("unset derivation vs the opposite explicit value differ", () => {
			expectSame(
				usage({
					should_prorate: false,
					allocated_billing_behavior: undefined,
				}),
				usage({
					should_prorate: false,
					allocated_billing_behavior: AllocatedBillingBehavior.Prorated,
				}),
				false,
			);
		});
	});

	describe("usage config — bill_when (strict)", () => {
		test("equal values are same", () => {
			expectSame(
				usage({ bill_when: BillWhen.EndOfPeriod }),
				usage({ bill_when: BillWhen.EndOfPeriod }),
				true,
			);
		});

		test("in_advance vs start_of_period differ here (successor key equates them)", () => {
			expectSame(
				usage({ bill_when: BillWhen.InAdvance }),
				usage({ bill_when: BillWhen.StartOfPeriod }),
				false,
			);
		});

		test("in_advance vs end_of_period differ", () => {
			expectSame(
				usage({ bill_when: BillWhen.InAdvance }),
				usage({ bill_when: BillWhen.EndOfPeriod }),
				false,
			);
		});
	});

	describe("usage config — billing_units (unset means 1)", () => {
		test("equal values same; different values differ", () => {
			expectSame(usage({ billing_units: 100 }), usage({ billing_units: 100 }), true);
			expectSame(usage({ billing_units: 1 }), usage({ billing_units: 100 }), false);
		});

		test("null, undefined, and 1 are all equivalent", () => {
			expectSame(usage({ billing_units: null }), usage({ billing_units: undefined }), true);
			expectSame(usage({ billing_units: null }), usage({ billing_units: 1 }), true);
			expectSame(usage({ billing_units: undefined }), usage({ billing_units: 1 }), true);
		});

		test("unset vs a non-default value differ", () => {
			expectSame(usage({ billing_units: null }), usage({ billing_units: 100 }), false);
			expectSame(usage({ billing_units: undefined }), usage({ billing_units: 100 }), false);
		});
	});

	describe("usage config — interval / interval_count", () => {
		test("interval strict", () => {
			expectSame(
				usage({ interval: BillingInterval.Month }),
				usage({ interval: BillingInterval.Year }),
				false,
			);
		});

		test("interval_count unset equals 1", () => {
			expectSame(
				usage({ interval_count: undefined }),
				usage({ interval_count: 1 }),
				true,
			);
			expectSame(
				usage({ interval_count: undefined }),
				usage({ interval_count: 2 }),
				false,
			);
			expectSame(usage({ interval_count: 1 }), usage({ interval_count: 3 }), false);
		});
	});

	describe("usage config — feature ids (both compared, strict)", () => {
		test("feature_id differs", () => {
			expectSame(usage({ feature_id: "messages" }), usage({ feature_id: "seats" }), false);
		});

		test("internal_feature_id differs even when feature_id matches", () => {
			expectSame(
				usage({ internal_feature_id: "ifeat_1" }),
				usage({ internal_feature_id: "ifeat_2" }),
				false,
			);
		});
	});

	describe("usage tiers", () => {
		const twoTiers: UsageTier[] = [
			{ to: 100, amount: 1 },
			{ to: TierInfinite, amount: 2 },
		];

		test("identical tiers are same", () => {
			expectSame(usage({ usage_tiers: twoTiers }), usage({ usage_tiers: [...twoTiers] }), true);
		});

		test("tier count differs", () => {
			expectSame(
				usage({ usage_tiers: twoTiers }),
				usage({ usage_tiers: [{ to: TierInfinite, amount: 1 }] }),
				false,
			);
		});

		test("non-last tier `to` is compared", () => {
			expectSame(
				usage({ usage_tiers: twoTiers }),
				usage({
					usage_tiers: [
						{ to: 200, amount: 1 },
						{ to: TierInfinite, amount: 2 },
					],
				}),
				false,
			);
		});

		test("last tier `to` is ignored (inf aliases)", () => {
			expectSame(
				usage({
					usage_tiers: [
						{ to: 100, amount: 1 },
						{ to: TierInfinite, amount: 2 },
					],
				}),
				usage({
					usage_tiers: [
						{ to: 100, amount: 1 },
						{ to: -1, amount: 2 },
					],
				}),
				true,
			);
			expectSame(
				usage({ usage_tiers: [{ to: TierInfinite, amount: 1 }] }),
				usage({ usage_tiers: [{ to: -1, amount: 1 }] }),
				true,
			);
		});

		test("tier amount differs", () => {
			expectSame(
				usage({ usage_tiers: [{ to: TierInfinite, amount: 1 }] }),
				usage({ usage_tiers: [{ to: TierInfinite, amount: 2 }] }),
				false,
			);
		});

		test("flat_amount unset equals 0", () => {
			expectSame(
				usage({ usage_tiers: [{ to: TierInfinite, amount: 1, flat_amount: 0 }] }),
				usage({ usage_tiers: [{ to: TierInfinite, amount: 1 }] }),
				true,
			);
			expectSame(
				usage({ usage_tiers: [{ to: TierInfinite, amount: 1, flat_amount: 5 }] }),
				usage({ usage_tiers: [{ to: TierInfinite, amount: 1 }] }),
				false,
			);
			expectSame(
				usage({ usage_tiers: [{ to: TierInfinite, amount: 1, flat_amount: 5 }] }),
				usage({ usage_tiers: [{ to: TierInfinite, amount: 1, flat_amount: 6 }] }),
				false,
			);
		});
	});

	describe("currencies map", () => {
		test("nullish maps and empty maps are all equivalent", () => {
			expectSame(usage({ currencies: null }), usage({ currencies: undefined }), true);
			expectSame(usage({ currencies: null }), usage({ currencies: {} }), true);
		});

		test("same key and amount are same; amount differs", () => {
			expectSame(
				usage({ currencies: { eur: { amount: 9 } } }),
				usage({ currencies: { eur: { amount: 9 } } }),
				true,
			);
			expectSame(
				usage({ currencies: { eur: { amount: 9 } } }),
				usage({ currencies: { eur: { amount: 8 } } }),
				false,
			);
		});

		test("key count and key case matter", () => {
			expectSame(
				usage({ currencies: {} }),
				usage({ currencies: { eur: { amount: 9 } } }),
				false,
			);
			expectSame(
				usage({ currencies: { eur: { amount: 9 } } }),
				usage({ currencies: { eur: { amount: 9 }, gbp: { amount: 7 } } }),
				false,
			);
			expectSame(
				usage({ currencies: { eur: { amount: 9 } } }),
				usage({ currencies: { EUR: { amount: 9 } } }),
				false,
			);
		});

		test("nullish amounts collapse; per-currency stripe ids are ignored", () => {
			expectSame(
				usage({ currencies: { eur: { amount: null } } }),
				usage({ currencies: { eur: {} } }),
				true,
			);
			expectSame(
				usage({
					currencies: { eur: { amount: 9, stripe_price_id: "a" } },
				}),
				usage({
					currencies: { eur: { amount: 9, stripe_price_id: "b" } },
				}),
				true,
			);
		});

		test("per-currency tiers compared via tiersAreSame", () => {
			expectSame(
				usage({
					currencies: {
						eur: { usage_tiers: [{ to: TierInfinite, amount: 1 }] },
					},
				}),
				usage({
					currencies: {
						eur: { usage_tiers: [{ to: TierInfinite, amount: 2 }] },
					},
				}),
				false,
			);
			expectSame(
				usage({ currencies: { eur: { amount: 9 } } }),
				usage({ currencies: { eur: { amount: 9, usage_tiers: [] } } }),
				true,
			);
		});
	});

	describe("proration_config and tier_behavior (usage path)", () => {
		test("both absent are same (null vs undefined)", () => {
			expectSame(
				usage({}, { proration_config: null }),
				usage({}, { proration_config: undefined }),
				true,
			);
		});

		test("absent vs configured differ", () => {
			expectSame(
				usage({}, { proration_config: null }),
				usage(
					{},
					{
						proration_config: {
							on_increase: OnIncrease.ProrateImmediately,
							on_decrease: OnDecrease.ProrateImmediately,
						},
					},
				),
				false,
			);
		});

		test("on_increase / on_decrease compared individually", () => {
			const base = {
				on_increase: OnIncrease.ProrateImmediately,
				on_decrease: OnDecrease.ProrateImmediately,
			};
			expectSame(
				usage({}, { proration_config: base }),
				usage({}, { proration_config: { ...base } }),
				true,
			);
			expectSame(
				usage({}, { proration_config: base }),
				usage(
					{},
					{
						proration_config: {
							...base,
							on_increase: OnIncrease.BillImmediately,
						},
					},
				),
				false,
			);
			expectSame(
				usage({}, { proration_config: base }),
				usage(
					{},
					{
						proration_config: { ...base, on_decrease: OnDecrease.None },
					},
				),
				false,
			);
		});

		test("tier_behavior unset equals graduated", () => {
			expectSame(
				usage({}, { tier_behavior: null }),
				usage({}, { tier_behavior: TierBehavior.Graduated }),
				true,
			);
			expectSame(
				usage({}, { tier_behavior: undefined }),
				usage({}, { tier_behavior: TierBehavior.Graduated }),
				true,
			);
			expectSame(
				usage({}, { tier_behavior: null }),
				usage({}, { tier_behavior: TierBehavior.VolumeBased }),
				false,
			);
			expectSame(
				usage({}, { tier_behavior: TierBehavior.Graduated }),
				usage({}, { tier_behavior: TierBehavior.VolumeBased }),
				false,
			);
		});
	});

	describe("ignored fields (differ but still same)", () => {
		test("price row identity fields are ignored", () => {
			expectSame(
				usage(
					{},
					{
						id: "pr_a",
						internal_product_id: "prod_a",
						org_id: "org_a",
						created_at: 1,
						is_custom: true,
						entitlement_id: "ent_a",
					},
				),
				usage(
					{},
					{
						id: "pr_b",
						internal_product_id: "prod_b",
						org_id: "org_b",
						created_at: 2,
						is_custom: false,
						entitlement_id: "ent_b",
					},
				),
				true,
			);
		});

		test("stripe resource ids on usage config are ignored", () => {
			expectSame(
				usage({
					stripe_price_id: "a",
					stripe_product_id: "a",
					stripe_meter_id: "a",
					stripe_placeholder_price_id: "a",
					stripe_event_name: "a",
					stripe_prepaid_price_v2_id: "a",
					stripe_empty_price_id: "a",
				}),
				usage({
					stripe_price_id: "b",
					stripe_product_id: "b",
					stripe_meter_id: "b",
					stripe_placeholder_price_id: "b",
					stripe_event_name: "b",
					stripe_prepaid_price_v2_id: "b",
					stripe_empty_price_id: "b",
				}),
				true,
			);
		});
	});
});

describe("tiersAreSame (direct)", () => {
	test("empty tier lists are same", () => {
		expect(tiersAreSame([], [])).toBe(true);
	});

	test("length mismatch differs", () => {
		expect(
			tiersAreSame([{ to: TierInfinite, amount: 1 }], []),
		).toBe(false);
	});

	test("single tier: `to` ignored, amount compared", () => {
		expect(
			tiersAreSame(
				[{ to: TierInfinite, amount: 1 }],
				[{ to: -1, amount: 1 }],
			),
		).toBe(true);
		expect(
			tiersAreSame(
				[{ to: TierInfinite, amount: 1 }],
				[{ to: TierInfinite, amount: 2 }],
			),
		).toBe(false);
	});
});
