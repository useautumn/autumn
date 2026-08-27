/**
 * hasEmptyStripeResource
 *
 * Contract:
 *   paid fixed / consumable / allocated v2 with empty attach slot → true
 *   prepaid V2 empty → true (V1 filled does not fill V2)
 *   filled slot, $0 fixed, one-off prepaid, allocated v1 → false
 */

import { describe, expect, test } from "bun:test";
import {
	AllocatedBillingBehavior,
	AppEnv,
	BillingInterval,
	BillWhen,
	type Price,
	PriceType,
	TierInfinite,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { hasEmptyStripeResource } from "@/internal/products/stripeResourceUtils/findReusableStripeResources/hasEmptyStripeResource.js";

const ctx = {
	org: { id: "org_1", default_currency: "usd" },
	env: AppEnv.Sandbox,
} as unknown as AutumnContext;

const empty = ({
	price,
	currency = "usd",
}: {
	price: Price;
	currency?: string;
}) => hasEmptyStripeResource({ ctx, targetPrice: price, currency });

const fixed = ({
	amount = 25,
	stripePriceId = null,
}: {
	amount?: number;
	stripePriceId?: string | null;
} = {}): Price => ({
	id: "pr_fixed",
	org_id: "org_1",
	created_at: 1,
	internal_product_id: "ip_pro",
	is_custom: true,
	config: {
		type: PriceType.Fixed,
		amount,
		interval: BillingInterval.Month,
		interval_count: 1,
		stripe_price_id: stripePriceId,
		feature_id: null,
		internal_feature_id: null,
	},
	proration_config: null,
});

const usage = ({
	overrides = {},
	stripePriceId = null,
}: {
	overrides?: Partial<UsagePriceConfig>;
	stripePriceId?: string | null;
} = {}): Price => ({
	id: "pr_usage",
	org_id: "org_1",
	created_at: 1,
	internal_product_id: "ip_pro",
	is_custom: true,
	config: {
		type: PriceType.Usage,
		bill_when: BillWhen.EndOfPeriod,
		billing_units: 1,
		internal_feature_id: "ifeat_messages",
		feature_id: "messages",
		usage_tiers: [{ amount: 1, to: TierInfinite }],
		interval: BillingInterval.Month,
		interval_count: 1,
		should_prorate: false,
		stripe_price_id: stripePriceId,
		...overrides,
	} satisfies UsagePriceConfig,
	proration_config: null,
});

describe("hasEmptyStripeResource", () => {
	test("true for empty paid fixed, consumable, and allocated v2 slots", () => {
		expect(empty({ price: fixed() })).toBe(true);
		expect(empty({ price: usage() })).toBe(true);
		expect(
			empty({
				price: usage({
					overrides: {
						should_prorate: true,
						allocated_billing_behavior: AllocatedBillingBehavior.Arrear,
					},
				}),
			}),
		).toBe(true);
	});

	test("true for empty prepaid V2 even when V1 is filled", () => {
		expect(
			empty({
				price: usage({ overrides: { bill_when: BillWhen.InAdvance } }),
			}),
		).toBe(true);
		expect(
			empty({
				price: usage({
					overrides: {
						bill_when: BillWhen.InAdvance,
						stripe_price_id: "price_v1",
					},
				}),
			}),
		).toBe(true);
	});

	test("false when the attach slot is filled", () => {
		expect(empty({ price: fixed({ stripePriceId: "price_1" }) })).toBe(false);
		expect(empty({ price: usage({ stripePriceId: "price_1" }) })).toBe(false);
		expect(
			empty({
				price: usage({
					overrides: {
						bill_when: BillWhen.InAdvance,
						stripe_prepaid_price_v2_id: "price_v2",
					},
				}),
			}),
		).toBe(false);
	});

	test("false for $0 fixed, one-off prepaid, and allocated v1", () => {
		expect(empty({ price: fixed({ amount: 0 }) })).toBe(false);
		expect(
			empty({
				price: usage({
					overrides: {
						bill_when: BillWhen.InAdvance,
						interval: BillingInterval.OneOff,
					},
				}),
			}),
		).toBe(false);
		expect(
			empty({
				price: usage({
					overrides: {
						should_prorate: true,
						allocated_billing_behavior: AllocatedBillingBehavior.Prorated,
					},
				}),
			}),
		).toBe(false);
	});
});
