/**
 * buildStripePriceIdempotencyKey
 *
 * Same Autumn price id + same mint shape → same key (retries dedupe).
 * Same id + $10 → $20 → different key (Stripe will not reject the remint).
 */

import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	type Price,
	PriceType,
} from "@autumn/shared";
import { buildStripePriceIdempotencyKey } from "@/external/stripe/prices/utils/buildIdempotencyKey.js";

const fixed = ({ amount }: { amount: number }): Price => ({
	id: "pr_abc",
	org_id: "org_1",
	created_at: 1,
	internal_product_id: "ip_pro",
	is_custom: false,
	config: {
		type: PriceType.Fixed,
		amount,
		interval: BillingInterval.Month,
		interval_count: 1,
		feature_id: null,
		internal_feature_id: null,
	},
	proration_config: null,
});

const key = ({ price, currency = "usd" }: { price: Price; currency?: string }) =>
	buildStripePriceIdempotencyKey({
		price,
		slot: "stripe_price_id",
		currency,
		orgDefault: "usd",
	});

describe("buildStripePriceIdempotencyKey", () => {
	test("same shape retries share a key; $10 → $20 does not", () => {
		const ten = fixed({ amount: 10 });
		const tenAgain = fixed({ amount: 10 });
		const twenty = fixed({ amount: 20 });

		expect(key({ price: ten })).toBe(key({ price: tenAgain }));
		expect(key({ price: ten })).not.toBe(key({ price: twenty }));
		expect(key({ price: ten })).toMatch(/^autumn:price:pr_abc:stripe_price_id:usd:[a-f0-9]{16}$/);
	});

	test("same id + amount, prorated → arrear, gets a new key", () => {
		const usage = ({ shouldProrate }: { shouldProrate: boolean }): Price => ({
			id: "pr_abc",
			org_id: "org_1",
			created_at: 1,
			internal_product_id: "ip_pro",
			is_custom: false,
			proration_config: null,
			config: {
				type: PriceType.Usage,
				bill_when: BillWhen.EndOfPeriod,
				should_prorate: shouldProrate,
				interval: BillingInterval.Month,
				interval_count: 1,
				billing_units: 1,
				usage_tiers: [{ to: "inf", amount: 1 }],
				feature_id: "messages",
				internal_feature_id: "feat_1",
			},
		});

		expect(key({ price: usage({ shouldProrate: true }) })).not.toBe(
			key({ price: usage({ shouldProrate: false }) }),
		);
	});
});
