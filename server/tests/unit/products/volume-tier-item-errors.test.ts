import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	type Feature,
	FeatureUsageType,
	type ProductItem,
	ProductItemInterval,
	TierBehavior,
	TierInfinite,
	UsageModel,
} from "@autumn/shared";
import { features } from "@tests/utils/fixtures/db/features.js";
import { validateProductItems } from "@/internal/products/product-items/validateProductItems";

const messages = features.create({
	id: "messages",
	name: "Messages",
	config: { usage_type: FeatureUsageType.SingleUse },
}) as Feature;

const validateVolumeItem = ({
	item,
	feature,
	validateAuthoringRules,
}: {
	item: ProductItem;
	feature?: Feature;
	validateAuthoringRules: boolean;
}) =>
	validateProductItems({
		newItems: [item],
		features: [feature ?? messages],
		orgId: "org_test",
		env: AppEnv.Sandbox,
		multiCurrencyEnabled: false,
		validateAuthoringRules,
	});

const payPerUseItem = ({
	tierBehavior,
}: {
	tierBehavior: TierBehavior;
}): ProductItem =>
	({
		feature_id: "messages",
		included_usage: 100,
		interval: ProductItemInterval.Month,
		usage_model: UsageModel.PayPerUse,
		tier_behavior: tierBehavior,
		tiers: [
			{ to: 100, amount: 1 },
			{ to: TierInfinite, amount: 0.5 },
		],
	}) as ProductItem;

describe("volume tier item errors", () => {
	test("accepts pay-per-use volume", () => {
		expect(() =>
			validateVolumeItem({
				validateAuthoringRules: true,
				item: payPerUseItem({ tierBehavior: TierBehavior.VolumeBased }),
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
				validateVolumeItem({
					validateAuthoringRules: true,
					item: allocatedItem({ includedUsage: 0 }),
					feature: seats,
				}),
			).toThrow("can't have a flat_amount on the first tier");
		});

		test("accepts it with included usage", () => {
			expect(() =>
				validateVolumeItem({
					validateAuthoringRules: true,
					item: allocatedItem({ includedUsage: 3 }),
					feature: seats,
				}),
			).not.toThrow();
		});
	});

	describe("single-tier usage-based volume", () => {
		const singleTierItem = ({ usageModel }: { usageModel: UsageModel }) =>
			({
				feature_id: "messages",
				included_usage: 100,
				interval: ProductItemInterval.Month,
				usage_model: usageModel,
				tier_behavior: TierBehavior.VolumeBased,
				price: 0.5,
			}) as ProductItem;

		test("rejects it when authoring", () => {
			expect(() =>
				validateVolumeItem({
					validateAuthoringRules: true,
					item: singleTierItem({ usageModel: UsageModel.PayPerUse }),
				}),
			).toThrow("needs at least two tiers");
		});

		test("accepts persisted rows on billing paths", () => {
			expect(() =>
				validateVolumeItem({
					validateAuthoringRules: false,
					item: singleTierItem({ usageModel: UsageModel.PayPerUse }),
				}),
			).not.toThrow();
		});

		test("accepts single-tier prepaid volume", () => {
			expect(() =>
				validateVolumeItem({
					validateAuthoringRules: true,
					item: singleTierItem({ usageModel: UsageModel.Prepaid }),
				}),
			).not.toThrow();
		});
	});
});
