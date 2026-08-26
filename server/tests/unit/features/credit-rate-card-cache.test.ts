import { describe, expect, test } from "bun:test";
import { type CreditSchemaItem, FeatureUsageType } from "@autumn/shared";
import { hasCreditRateCardChanged } from "@/internal/features/featureActions/hasCreditRateCardChanged.js";

const baseConfig = {
	usage_type: FeatureUsageType.Single,
	provider_markups: undefined,
};

describe("credit rate-card cache comparison", () => {
	test("treats schema order and an explicit one billing unit as equivalent", () => {
		expect(
			hasCreditRateCardChanged({
				oldConfig: {
					...baseConfig,
					schema: [
						{ metered_feature_id: "feature_a", credit_amount: 1 },
						{ metered_feature_id: "feature_b", credit_amount: 2 },
					],
				},
				newConfig: {
					...baseConfig,
					schema: [
						{
							metered_feature_id: "feature_b",
							feature_amount: 1,
							credit_amount: 2,
						},
						{
							metered_feature_id: "feature_a",
							feature_amount: 1,
							credit_amount: 1,
						},
					],
				},
			}),
		).toBe(false);
	});

	test.each([
		{
			name: "billing units",
			oldItem: { metered_feature_id: "feature_a", credit_amount: 1 },
			newItem: {
				metered_feature_id: "feature_a",
				feature_amount: 100,
				credit_amount: 1,
			},
		},
		{
			name: "flat cost",
			oldItem: { metered_feature_id: "feature_a", credit_amount: 1 },
			newItem: { metered_feature_id: "feature_a", credit_amount: 2 },
		},
		{
			name: "tier boundary",
			oldItem: {
				metered_feature_id: "feature_a",
				tier_behavior: "graduated" as const,
				tiers: [
					{ to: 100, credit_amount: 1 },
					{ to: "inf" as const, credit_amount: 0.5 },
				],
			},
			newItem: {
				metered_feature_id: "feature_a",
				tier_behavior: "graduated" as const,
				tiers: [
					{ to: 200, credit_amount: 1 },
					{ to: "inf" as const, credit_amount: 0.5 },
				],
			},
		},
		{
			name: "tier cost",
			oldItem: {
				metered_feature_id: "feature_a",
				tier_behavior: "graduated" as const,
				tiers: [{ to: "inf" as const, credit_amount: 0.5 }],
			},
			newItem: {
				metered_feature_id: "feature_a",
				tier_behavior: "graduated" as const,
				tiers: [{ to: "inf" as const, credit_amount: 0.4 }],
			},
		},
	] satisfies Array<{
		name: string;
		oldItem: CreditSchemaItem;
		newItem: CreditSchemaItem;
	}>)("detects a changed $name", ({ oldItem, newItem }) => {
		expect(
			hasCreditRateCardChanged({
				oldConfig: { ...baseConfig, schema: [oldItem] },
				newConfig: { ...baseConfig, schema: [newItem] },
			}),
		).toBe(true);
	});

	test("detects toggling invoice-credit mode", () => {
		expect(
			hasCreditRateCardChanged({
				oldConfig: { ...baseConfig, schema: [] },
				newConfig: {
					...baseConfig,
					schema: [],
					invoice_credit: true,
				},
			}),
		).toBe(true);
	});
});
