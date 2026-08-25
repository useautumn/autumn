import { describe, expect, test } from "bun:test";
import { FeatureType, FeatureUsageType } from "@autumn/shared";
import { features } from "@tests/utils/fixtures/db/features.js";
import { resolveCreditCost } from "@/internal/analytics/actions/aggregateDeductions.js";

const sourceFeature = features.create({
	id: "source",
	internalId: "internal_source",
	name: "Source",
});

const makeContext = ({ graduated }: { graduated: boolean }) => ({
	features: [
		sourceFeature,
		features.create({
			id: "credits",
			internalId: "internal_credits",
			name: "Credits",
			type: FeatureType.CreditSystem,
			config: {
				usage_type: FeatureUsageType.Single,
				schema: [
					graduated
						? {
								metered_feature_id: sourceFeature.id,
								feature_amount: 100,
								tier_behavior: "graduated" as const,
								tiers: [
									{ to: 10_000, credit_amount: 1 },
									{ to: "inf" as const, credit_amount: 0.5 },
								],
							}
						: {
								metered_feature_id: sourceFeature.id,
								feature_amount: 100,
								credit_amount: 1,
							},
				],
			},
		}),
	],
});

describe("deduction analytics credit cost", () => {
	test("returns a constant rate for a flat card", () => {
		expect(
			resolveCreditCost({
				ctx: makeContext({ graduated: false }) as never,
				sourceFeatureId: sourceFeature.id,
				balanceFeatureId: "credits",
			}),
		).toBe(0.01);
	});

	test("returns no single rate for a graduated card", () => {
		expect(
			resolveCreditCost({
				ctx: makeContext({ graduated: true }) as never,
				sourceFeatureId: sourceFeature.id,
				balanceFeatureId: "credits",
			}),
		).toBeNull();
	});
});
