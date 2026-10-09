import { describe, expect, test } from "bun:test";
import {
	type ProductItem,
	ProductItemInterval,
	TierBehavior,
	TierInfinite,
	UsageModel,
} from "@autumn/shared";
import { validateItemTierBehavior } from "@/internal/products/product-items/validateItemTierBehavior.js";

const volumeItem = ({
	usageModel,
	tiers,
}: {
	usageModel: UsageModel;
	tiers: ProductItem["tiers"];
}): ProductItem =>
	({
		feature_id: "messages",
		included_usage: 100,
		interval: ProductItemInterval.Month,
		usage_model: usageModel,
		tier_behavior: TierBehavior.VolumeBased,
		tiers,
	}) as ProductItem;

const SINGLE_TIER: ProductItem["tiers"] = [{ to: TierInfinite, amount: 0.5 }];
const MULTI_TIER: ProductItem["tiers"] = [
	{ to: 100, amount: 1 },
	{ to: TierInfinite, amount: 0.5 },
];

describe("validateItemTierBehavior", () => {
	test("authoring: rejects single-tier pay-per-use volume", () => {
		expect(() =>
			validateItemTierBehavior({
				item: volumeItem({
					usageModel: UsageModel.PayPerUse,
					tiers: SINGLE_TIER,
				}),
				validateAuthoringRules: true,
			}),
		).toThrow("Volume-based pricing is only supported for prepaid items");
	});

	test("billing re-validation: accepts persisted single-tier pay-per-use volume", () => {
		expect(() =>
			validateItemTierBehavior({
				item: volumeItem({
					usageModel: UsageModel.PayPerUse,
					tiers: SINGLE_TIER,
				}),
				validateAuthoringRules: false,
			}),
		).not.toThrow();
	});

	test("billing re-validation: still rejects multi-tier pay-per-use volume", () => {
		expect(() =>
			validateItemTierBehavior({
				item: volumeItem({
					usageModel: UsageModel.PayPerUse,
					tiers: MULTI_TIER,
				}),
				validateAuthoringRules: false,
			}),
		).toThrow("Volume-based pricing is only supported for prepaid items");
	});

	test("prepaid volume is allowed", () => {
		expect(() =>
			validateItemTierBehavior({
				item: volumeItem({ usageModel: UsageModel.Prepaid, tiers: MULTI_TIER }),
				validateAuthoringRules: true,
			}),
		).not.toThrow();
	});
});
