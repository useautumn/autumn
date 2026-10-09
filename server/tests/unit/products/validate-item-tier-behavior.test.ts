import { describe, expect, test } from "bun:test";
import {
	type Feature,
	FeatureUsageType,
	type ProductItem,
	ProductItemInterval,
	TierBehavior,
	TierInfinite,
	UsageModel,
} from "@autumn/shared";
import { features } from "@tests/utils/fixtures/db/features.js";
import { validateItemTierBehavior } from "@/internal/products/product-items/validateItemTierBehavior.js";

const payPerUseItem = ({
	tierBehavior,
	thresholdBilling,
}: {
	tierBehavior: TierBehavior;
	thresholdBilling?: { threshold: number };
}): ProductItem =>
	({
		feature_id: "messages",
		included_usage: 100,
		interval: ProductItemInterval.Month,
		usage_model: UsageModel.PayPerUse,
		tier_behavior: tierBehavior,
		price: 0.5,
		config: thresholdBilling ? { threshold_billing: thresholdBilling } : null,
	}) as ProductItem;

describe("validateItemTierBehavior", () => {
	test("accepts pay-per-use volume", () => {
		expect(() =>
			validateItemTierBehavior({
				item: payPerUseItem({ tierBehavior: TierBehavior.VolumeBased }),
			}),
		).not.toThrow();
	});

	test("rejects volume with threshold_billing, even on a single tier", () => {
		expect(() =>
			validateItemTierBehavior({
				item: payPerUseItem({
					tierBehavior: TierBehavior.VolumeBased,
					thresholdBilling: { threshold: 50 },
				}),
			}),
		).toThrow("threshold_billing can't be combined with volume-based pricing");
	});

	test("accepts graduated single price with threshold_billing", () => {
		expect(() =>
			validateItemTierBehavior({
				item: payPerUseItem({
					tierBehavior: TierBehavior.Graduated,
					thresholdBilling: { threshold: 50 },
				}),
			}),
		).not.toThrow();
	});

	describe("allocated seats with a tier-1 flat_amount", () => {
		const seats = features.create({
			id: "users",
			name: "Users",
			config: { usage_type: FeatureUsageType.Continuous },
		}) as Feature;
		const allocatedItem = ({
			includedUsage,
		}: {
			includedUsage: number;
		}): ProductItem =>
			({
				feature_id: "users",
				included_usage: includedUsage,
				interval: ProductItemInterval.Month,
				usage_model: UsageModel.PayPerUse,
				tier_behavior: TierBehavior.VolumeBased,
				tiers: [
					{ to: 10, amount: 10, flat_amount: 5 },
					{ to: TierInfinite, amount: 8 },
				],
			}) as ProductItem;

		test("rejects it without included usage", () => {
			expect(() =>
				validateItemTierBehavior({
					item: allocatedItem({ includedUsage: 0 }),
					feature: seats,
				}),
			).toThrow("can't have a flat_amount on the first tier");
		});

		test("accepts it with included usage", () => {
			expect(() =>
				validateItemTierBehavior({
					item: allocatedItem({ includedUsage: 3 }),
					feature: seats,
				}),
			).not.toThrow();
		});
	});
});
