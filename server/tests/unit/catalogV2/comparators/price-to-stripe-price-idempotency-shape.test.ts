/**
 * Stripe Price idempotency shape — fields that change prices.create
 * for THIS currency. Same normalizations as pricesAreSame for those fields.
 *
 * In:  amount (this currency), usage_tiers (this currency), interval,
 *      interval_count, billing_units (usage), tier_behavior (usage),
 *      bill_when, should_prorate, allocated_billing_behavior
 * Out: entitlement, feature ids, proration, other-currency overlays,
 *      stripe ids
 *
 * Red (current):  bill_when / should_prorate collide so allocated→arrear remint
 *                 reuses autumn:price:{id}:stripe_price_id:{ccy}:{hash}
 * Green (after):  those config fields change the hash
 */

import { describe, expect, test } from "bun:test";
import {
	AllocatedBillingBehavior,
	BillingInterval,
	BillWhen,
	type FixedPriceConfig,
	OnDecrease,
	OnIncrease,
	type Price,
	priceToStripePriceIdempotencyShape,
	TierBehavior,
	TierInfinite,
	type UsagePriceConfig,
} from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";

const orgDefault = "usd";

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

const shape = ({
	price,
	currency = "usd",
}: {
	price: Price;
	currency?: string;
}) => priceToStripePriceIdempotencyShape({ price, currency, orgDefault });

const expectShapeSame = (a: Price, b: Price, expected: boolean) => {
	if (expected) {
		expect(shape({ price: a })).toEqual(shape({ price: b }));
		expect(shape({ price: b })).toEqual(shape({ price: a }));
		return;
	}
	expect(shape({ price: a })).not.toEqual(shape({ price: b }));
	expect(shape({ price: b })).not.toEqual(shape({ price: a }));
};

describe("priceToStripePriceIdempotencyShape", () => {
	test("identical baselines are same", () => {
		expectShapeSame(fixed(), fixed(), true);
		expectShapeSame(usage(), usage(), true);
	});

	describe("fixed — amount / interval / interval_count", () => {
		test("amount", () => {
			expectShapeSame(fixed({ amount: 10 }), fixed({ amount: 10 }), true);
			expectShapeSame(fixed({ amount: 10 }), fixed({ amount: 11 }), false);
			expectShapeSame(fixed({ amount: 0 }), fixed({ amount: 0 }), true);
		});

		test("interval", () => {
			expectShapeSame(
				fixed({ interval: BillingInterval.Month }),
				fixed({ interval: BillingInterval.Year }),
				false,
			);
			expectShapeSame(
				fixed({ interval: BillingInterval.OneOff }),
				fixed({ interval: BillingInterval.OneOff }),
				true,
			);
		});

		test("interval_count unset equals 1", () => {
			expectShapeSame(
				fixed({ interval_count: undefined }),
				fixed({ interval_count: 1 }),
				true,
			);
			expectShapeSame(
				fixed({ interval_count: undefined }),
				fixed({ interval_count: 2 }),
				false,
			);
			expectShapeSame(
				fixed({ interval_count: 1 }),
				fixed({ interval_count: 2 }),
				false,
			);
		});
	});

	describe("usage — interval / interval_count / billing_units / tiers", () => {
		test("interval strict", () => {
			expectShapeSame(
				usage({ interval: BillingInterval.Month }),
				usage({ interval: BillingInterval.Year }),
				false,
			);
		});

		test("interval_count unset equals 1", () => {
			expectShapeSame(
				usage({ interval_count: undefined }),
				usage({ interval_count: 1 }),
				true,
			);
			expectShapeSame(
				usage({ interval_count: undefined }),
				usage({ interval_count: 2 }),
				false,
			);
		});

		test("billing_units unset/null equals 1", () => {
			expectShapeSame(
				usage({ billing_units: 100 }),
				usage({ billing_units: 100 }),
				true,
			);
			expectShapeSame(
				usage({ billing_units: 1 }),
				usage({ billing_units: 100 }),
				false,
			);
			expectShapeSame(
				usage({ billing_units: null }),
				usage({ billing_units: undefined }),
				true,
			);
			expectShapeSame(
				usage({ billing_units: null }),
				usage({ billing_units: 1 }),
				true,
			);
			expectShapeSame(
				usage({ billing_units: undefined }),
				usage({ billing_units: 100 }),
				false,
			);
		});

		test("tier amount / count / non-last `to`", () => {
			const twoTiers = [
				{ to: 100, amount: 1 },
				{ to: TierInfinite, amount: 2 },
			];
			expectShapeSame(
				usage({ usage_tiers: twoTiers }),
				usage({ usage_tiers: [...twoTiers] }),
				true,
			);
			expectShapeSame(
				usage({ usage_tiers: twoTiers }),
				usage({ usage_tiers: [{ to: TierInfinite, amount: 1 }] }),
				false,
			);
			expectShapeSame(
				usage({ usage_tiers: twoTiers }),
				usage({
					usage_tiers: [
						{ to: 200, amount: 1 },
						{ to: TierInfinite, amount: 2 },
					],
				}),
				false,
			);
			expectShapeSame(
				usage({ usage_tiers: [{ to: TierInfinite, amount: 1 }] }),
				usage({ usage_tiers: [{ to: TierInfinite, amount: 2 }] }),
				false,
			);
		});

		test("last tier `to` is ignored; flat_amount unset equals 0", () => {
			expectShapeSame(
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
			expectShapeSame(
				usage({ usage_tiers: [{ to: TierInfinite, amount: 1 }] }),
				usage({ usage_tiers: [{ to: -1, amount: 1 }] }),
				true,
			);
			expectShapeSame(
				usage({
					usage_tiers: [{ to: TierInfinite, amount: 1, flat_amount: 0 }],
				}),
				usage({ usage_tiers: [{ to: TierInfinite, amount: 1 }] }),
				true,
			);
			expectShapeSame(
				usage({
					usage_tiers: [{ to: TierInfinite, amount: 1, flat_amount: 5 }],
				}),
				usage({ usage_tiers: [{ to: TierInfinite, amount: 1 }] }),
				false,
			);
		});

		test("tier_behavior unset equals graduated", () => {
			expectShapeSame(
				usage({}, { tier_behavior: null }),
				usage({}, { tier_behavior: TierBehavior.Graduated }),
				true,
			);
			expectShapeSame(
				usage({}, { tier_behavior: undefined }),
				usage({}, { tier_behavior: TierBehavior.Graduated }),
				true,
			);
			expectShapeSame(
				usage({}, { tier_behavior: TierBehavior.Graduated }),
				usage({}, { tier_behavior: TierBehavior.VolumeBased }),
				false,
			);
		});
	});

	describe("this currency only", () => {
		test("USD amount is the base amount; EUR reads the overlay", () => {
			const price = usage({
				base_currency: "usd",
				usage_tiers: [{ to: TierInfinite, amount: 1 }],
				currencies: {
					eur: { amount: 9, usage_tiers: [{ to: TierInfinite, amount: 2 }] },
				},
			});
			expect(shape({ price, currency: "usd" }).amount).toBeNull();
			expect(shape({ price, currency: "usd" }).usage_tiers[0]?.amount).toBe(1);
			expect(shape({ price, currency: "eur" }).amount).toBe(9);
			expect(shape({ price, currency: "eur" }).usage_tiers[0]?.amount).toBe(2);
		});

		test("changing another currency does not change this currency's shape", () => {
			const usd10 = usage({
				base_currency: "usd",
				usage_tiers: [{ to: TierInfinite, amount: 1 }],
				currencies: { eur: { amount: 9 } },
			});
			const usd10EurChanged = usage({
				base_currency: "usd",
				usage_tiers: [{ to: TierInfinite, amount: 1 }],
				currencies: { eur: { amount: 8 } },
			});
			expect(shape({ price: usd10, currency: "usd" })).toEqual(
				shape({ price: usd10EurChanged, currency: "usd" }),
			);
			expect(shape({ price: usd10, currency: "eur" })).not.toEqual(
				shape({ price: usd10EurChanged, currency: "eur" }),
			);
		});
	});

	describe("usage — billing path (in-place config update remints the same slot)", () => {
		test("bill_when", () => {
			expectShapeSame(
				usage({ bill_when: BillWhen.EndOfPeriod }),
				usage({ bill_when: BillWhen.InAdvance }),
				false,
			);
		});

		test("should_prorate", () => {
			expectShapeSame(
				usage({ should_prorate: false }),
				usage({ should_prorate: true }),
				false,
			);
		});

		test("allocated_billing_behavior", () => {
			expectShapeSame(
				usage({ allocated_billing_behavior: AllocatedBillingBehavior.Prorated }),
				usage({ allocated_billing_behavior: AllocatedBillingBehavior.Arrear }),
				false,
			);
		});
	});

	describe("ignored (differ but still same shape)", () => {
		test("stripe ids, feature ids, entitlement", () => {
			expectShapeSame(
				usage({
					stripe_price_id: "a",
					stripe_product_id: "a",
					stripe_meter_id: "a",
					feature_id: "messages",
					internal_feature_id: "ifeat_1",
				}),
				usage({
					stripe_price_id: "b",
					stripe_product_id: "b",
					stripe_meter_id: "b",
					feature_id: "seats",
					internal_feature_id: "ifeat_2",
				}),
				true,
			);
		});

		test("proration_config and row identity are ignored", () => {
			expectShapeSame(
				usage(
					{},
					{
						id: "pr_a",
						entitlement_id: "ent_a",
						proration_config: {
							on_increase: OnIncrease.ProrateImmediately,
							on_decrease: OnDecrease.ProrateImmediately,
						},
					},
				),
				usage(
					{},
					{
						id: "pr_b",
						entitlement_id: "ent_b",
						proration_config: null,
					},
				),
				true,
			);
		});

		test("fixed ignores billing_units, stripe ids, and tier_behavior", () => {
			expectShapeSame(
				fixed(
					{
						stripe_price_id: "price_a",
						billing_units: 1,
					},
					{ tier_behavior: TierBehavior.VolumeBased },
				),
				fixed(
					{
						stripe_price_id: "price_b",
						billing_units: 100,
					},
					{ tier_behavior: null },
				),
				true,
			);
		});
	});
});
