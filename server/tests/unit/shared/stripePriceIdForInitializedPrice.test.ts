import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	type Price,
	PriceType,
	stripePriceIdForInitializedPrice,
	TierInfinite,
	type UsagePriceConfig,
} from "@autumn/shared";

const usage = ({
	amount,
	stripePriceId,
}: {
	amount: number;
	stripePriceId?: string;
}): Price => ({
	id: "pr_messages",
	org_id: "org_1",
	created_at: 1,
	internal_product_id: "prod_1",
	is_custom: false,
	config: {
		type: PriceType.Usage,
		bill_when: BillWhen.StartOfPeriod,
		billing_units: 100,
		should_prorate: false,
		internal_feature_id: "feat_messages",
		feature_id: "messages",
		usage_tiers: [{ amount, to: TierInfinite }],
		interval: BillingInterval.Month,
		interval_count: 1,
		...(stripePriceId !== undefined ? { stripe_price_id: stripePriceId } : {}),
	} as UsagePriceConfig,
	entitlement_id: "ent_messages",
	proration_config: null,
	tier_behavior: null,
});

describe("stripePriceIdForInitializedPrice", () => {
	test("keeps an imported id when there is no current price", () => {
		expect(
			stripePriceIdForInitializedPrice({
				requestedStripePriceId: "price_imported",
				newPrice: usage({ amount: 10 }),
			}),
		).toBe("price_imported");
	});

	test("drops a round-tripped id when the current price definition drifted", () => {
		expect(
			stripePriceIdForInitializedPrice({
				requestedStripePriceId: "price_old",
				currentPrice: usage({ amount: 10, stripePriceId: "price_old" }),
				newPrice: usage({ amount: 500 }),
			}),
		).toBeUndefined();
	});

	test("keeps a round-tripped id when the definition still matches", () => {
		expect(
			stripePriceIdForInitializedPrice({
				requestedStripePriceId: "price_old",
				currentPrice: usage({ amount: 10, stripePriceId: "price_old" }),
				newPrice: usage({ amount: 10 }),
			}),
		).toBe("price_old");
	});

	test("keeps a requested id that the current price does not own", () => {
		expect(
			stripePriceIdForInitializedPrice({
				requestedStripePriceId: "price_imported",
				currentPrice: usage({ amount: 10, stripePriceId: "price_old" }),
				newPrice: usage({ amount: 500 }),
			}),
		).toBe("price_imported");
	});
});
