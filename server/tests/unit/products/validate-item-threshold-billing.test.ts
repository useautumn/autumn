import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	BillingInterval,
	type ProductItem,
	TierBehavior,
	UsageModel,
} from "@autumn/shared";
import { validateProductItems } from "@/internal/products/product-items/validateProductItems";

const run = (item: ProductItem) =>
	validateProductItems({
		newItems: [item],
		features: [],
		orgId: "org_1",
		env: AppEnv.Sandbox,
		multiCurrencyEnabled: false,
	});

const consumableItem = ({
	tiers,
	threshold,
	tierBehavior,
	usageModel = UsageModel.PayPerUse,
}: {
	tiers: { to: number; amount: number }[];
	threshold?: number;
	tierBehavior?: TierBehavior;
	usageModel?: UsageModel;
}) =>
	({
		feature_id: "messages",
		feature_type: "single_use",
		included_usage: 0,
		interval: BillingInterval.Month,
		usage_model: usageModel,
		tier_behavior: tierBehavior,
		tiers,
		config: threshold ? { threshold_billing: { threshold } } : undefined,
	}) as unknown as ProductItem;

const multiTier = [
	{ to: 100, amount: 0.5 },
	{ to: -1, amount: 0.25 },
];

describe("validateProductItems threshold_billing", () => {
	test("rejects threshold_billing with graduated multi-tier price", () => {
		expect(() =>
			run(consumableItem({ tiers: multiTier, threshold: 50 })),
		).toThrow(/threshold_billing can't be combined with tiered pricing/);
	});

	test("rejects threshold_billing with volume multi-tier price", () => {
		expect(() =>
			run(
				consumableItem({
					tiers: multiTier,
					threshold: 50,
					tierBehavior: TierBehavior.VolumeBased,
					usageModel: UsageModel.Prepaid,
				}),
			),
		).toThrow(/threshold_billing can't be combined with tiered pricing/);
	});

	test("accepts threshold_billing with single-tier price", () => {
		expect(() =>
			run(consumableItem({ tiers: [{ to: -1, amount: 0.5 }], threshold: 50 })),
		).not.toThrow();
	});

	test("accepts multi-tier price without threshold_billing", () => {
		expect(() => run(consumableItem({ tiers: multiTier }))).not.toThrow();
	});
});
