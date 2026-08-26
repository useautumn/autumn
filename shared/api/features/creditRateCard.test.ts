import { describe, expect, test } from "bun:test";
import { FeatureType } from "../../models/featureModels/featureEnums.js";
import { ApiFeatureV1Schema } from "./apiFeatureV1.js";
import { CreateFeatureV2ParamsSchema } from "./crud/createFeatureParams.js";
import { UpdateFeatureV2ParamsSchema } from "./crud/updateFeatureParams.js";

describe("credit rate-card feature API schemas", () => {
	test("keeps the existing flat request shape valid", () => {
		const result = CreateFeatureV2ParamsSchema.parse({
			feature_id: "credits",
			name: "Credits",
			type: FeatureType.CreditSystem,
			credit_schema: [{ metered_feature_id: "feature_a", credit_cost: 0.2 }],
		});

		expect(result.credit_schema).toEqual([
			{ metered_feature_id: "feature_a", credit_cost: 0.2 },
		]);
		expect(result.invoice_credit).toBeUndefined();
	});

	test("accepts public per-X and graduated request rates", () => {
		const result = CreateFeatureV2ParamsSchema.parse({
			feature_id: "credits",
			name: "Credits",
			type: FeatureType.CreditSystem,
			invoice_credit: true,
			credit_schema: [
				{
					metered_feature_id: "feature_a",
					billing_units: 100,
					credit_cost: 1,
				},
				{
					metered_feature_id: "feature_b",
					billing_units: 1_000,
					tier_behavior: "graduated",
					tiers: [
						{ to: 10_000, credit_cost: 1 },
						{ to: 50_000, credit_cost: 0.8 },
						{ to: "inf", credit_cost: 0.5 },
					],
				},
			],
		});

		expect(result.invoice_credit).toBe(true);
		expect(result.credit_schema?.[1]).toMatchObject({
			billing_units: 1_000,
			tier_behavior: "graduated",
		});
	});

	test("accepts public per-X and graduated response rates", () => {
		const result = ApiFeatureV1Schema.parse({
			id: "credits",
			name: "Credits",
			type: FeatureType.CreditSystem,
			consumable: true,
			invoice_credit: true,
			credit_schema: [
				{
					metered_feature_id: "feature_a",
					billing_units: 100,
					credit_cost: 1,
				},
				{
					metered_feature_id: "feature_b",
					tier_behavior: "graduated",
					tiers: [{ to: "inf", credit_cost: 0.5 }],
				},
			],
			archived: false,
		});

		expect(result.invoice_credit).toBe(true);
		expect(result.credit_schema).toHaveLength(2);
	});

	test("accepts legacy response rates with an empty metered feature ID", () => {
		const result = ApiFeatureV1Schema.parse({
			id: "credits",
			name: "Credits",
			type: FeatureType.CreditSystem,
			consumable: true,
			credit_schema: [{ metered_feature_id: "", credit_cost: 0 }],
			archived: false,
		});

		expect(result.credit_schema).toEqual([
			{ metered_feature_id: "", credit_cost: 0 },
		]);
	});

	test("rejects empty metered feature IDs in create and update requests", () => {
		expect(
			CreateFeatureV2ParamsSchema.safeParse({
				feature_id: "credits",
				name: "Credits",
				type: FeatureType.CreditSystem,
				credit_schema: [{ metered_feature_id: "", credit_cost: 0 }],
			}).success,
		).toBe(false);

		expect(
			UpdateFeatureV2ParamsSchema.safeParse({
				feature_id: "credits",
				credit_schema: [{ metered_feature_id: "", credit_cost: 0 }],
			}).success,
		).toBe(false);
	});

	test("supports partial rate-card updates", () => {
		const result = UpdateFeatureV2ParamsSchema.parse({
			feature_id: "credits",
			invoice_credit: false,
			credit_schema: [
				{
					metered_feature_id: "feature_a",
					billing_units: 100,
					credit_cost: 1,
				},
			],
		});

		expect(result.invoice_credit).toBe(false);
		expect(result.credit_schema?.[0]).toMatchObject({ billing_units: 100 });
	});

	test("rejects ambiguous or incomplete graduated tiers", () => {
		const base = {
			feature_id: "credits",
			name: "Credits",
			type: FeatureType.CreditSystem,
		};

		expect(
			CreateFeatureV2ParamsSchema.safeParse({
				...base,
				credit_schema: [
					{
						metered_feature_id: "feature_a",
						credit_cost: 1,
						tier_behavior: "graduated",
						tiers: [{ to: "inf", credit_cost: 0.5 }],
					},
				],
			}).success,
		).toBe(false);

		expect(
			CreateFeatureV2ParamsSchema.safeParse({
				...base,
				credit_schema: [
					{
						metered_feature_id: "feature_a",
						tier_behavior: "graduated",
						tiers: [
							{ to: 100, credit_cost: 1 },
							{ to: 50, credit_cost: 0.8 },
						],
					},
				],
			}).success,
		).toBe(false);
	});

	test("rejects invoice credits on non-classic credit features", () => {
		expect(
			CreateFeatureV2ParamsSchema.safeParse({
				feature_id: "ai_credits",
				name: "AI credits",
				type: FeatureType.AiCreditSystem,
				invoice_credit: true,
			}).success,
		).toBe(false);
		expect(
			UpdateFeatureV2ParamsSchema.safeParse({
				feature_id: "ai_credits",
				type: FeatureType.AiCreditSystem,
				invoice_credit: false,
			}).success,
		).toBe(false);
	});
});
