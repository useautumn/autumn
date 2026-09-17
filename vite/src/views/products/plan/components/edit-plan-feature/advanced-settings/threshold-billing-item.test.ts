import { expect, test } from "bun:test";
import {
	Infinite,
	type ProductItem,
	ProductItemInterval,
	UsageModel,
} from "@autumn/shared";
import {
	itemThreshold,
	reconcileThresholdBilling,
	showsThresholdBilling,
	withThresholdBilling,
} from "./thresholdBillingItem";

const payPerUse: ProductItem = {
	feature_id: "messages",
	included_usage: 100,
	interval: ProductItemInterval.Month,
	usage_model: UsageModel.PayPerUse,
	price: 0.1,
	billing_units: 1,
};

test("only a finite pay-per-use price can bill on a threshold", () => {
	expect(showsThresholdBilling({ item: payPerUse })).toBe(true);
	expect(
		showsThresholdBilling({
			item: { ...payPerUse, usage_model: UsageModel.Prepaid },
		}),
	).toBe(false);
	expect(
		showsThresholdBilling({ item: { ...payPerUse, included_usage: Infinite } }),
	).toBe(false);
	expect(
		showsThresholdBilling({
			item: { feature_id: "messages", included_usage: 100 },
		}),
	).toBe(false);
});

test("setting a threshold writes item.config.threshold_billing and clearing removes it", () => {
	const enabled = withThresholdBilling({ item: payPerUse, threshold: 250 });
	expect(enabled.config?.threshold_billing).toEqual({ threshold: 250 });
	expect(itemThreshold({ item: enabled })).toBe(250);

	const cleared = withThresholdBilling({ item: enabled, threshold: null });
	expect(cleared.config?.threshold_billing).toBeUndefined();
	expect(itemThreshold({ item: cleared })).toBeNull();
});

test("clearing keeps the rest of the item config", () => {
	const withOther = {
		...payPerUse,
		config: { threshold_billing: { threshold: 50 }, on_increase: null },
	} as ProductItem;
	const cleared = withThresholdBilling({ item: withOther, threshold: null });
	expect(cleared.config).toEqual({ on_increase: null });
});

test("an item edited out of eligibility drops its stale threshold", () => {
	const enabled = withThresholdBilling({ item: payPerUse, threshold: 20 });

	// Still eligible → untouched, same reference so save stays a no-op.
	expect(reconcileThresholdBilling({ item: enabled })).toBe(enabled);

	// Switched to prepaid → the API would reject the leftover threshold.
	const prepaid = { ...enabled, usage_model: UsageModel.Prepaid };
	expect(
		itemThreshold({ item: reconcileThresholdBilling({ item: prepaid }) }),
	).toBeNull();

	// Made unlimited → same.
	const unlimited = { ...enabled, included_usage: Infinite };
	expect(
		itemThreshold({ item: reconcileThresholdBilling({ item: unlimited }) }),
	).toBeNull();
});
