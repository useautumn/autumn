import { describe, expect, test } from "bun:test";
import { type Feature, FeatureType, FeatureUsageType } from "@autumn/shared";
import {
	validateCreditSystem,
	validateCreditSystemSchemaReferences,
} from "@/internal/features/featureUtils.js";

const makeFeature = (id: string, type: FeatureType): Feature => ({
	internal_id: `fe_${id}`,
	org_id: "org_test",
	created_at: Date.now(),
	env: "sandbox" as Feature["env"],
	id,
	name: id,
	type,
	config: {},
	archived: false,
	event_names: [],
	model_markups: null,
});

describe("validateCreditSystem — AI credit system schema restrictions", () => {
	test("rejects an AI credit system with a non-empty schema", () => {
		expect(() =>
			validateCreditSystem(
				{
					schema: [{ metered_feature_id: "messages", credit_amount: 1 }] as any,
					usage_type: FeatureUsageType.Single,
				},
				FeatureType.AiCreditSystem,
			),
		).toThrow(/leaf features/);
	});

	test("allows an AI credit system with an empty schema", () => {
		const result = validateCreditSystem(
			{
				schema: [],
				usage_type: FeatureUsageType.Single,
			},
			FeatureType.AiCreditSystem,
		);
		expect(result.schema).toHaveLength(0);
	});

	test("rejects a regular credit system with empty schema", () => {
		expect(() =>
			validateCreditSystem(
				{ schema: [], usage_type: FeatureUsageType.Single },
				FeatureType.CreditSystem,
			),
		).toThrow(/At least one metered feature/);
	});
});

describe("validateCreditSystemSchemaReferences — cross-feature restrictions", () => {
	const metered = makeFeature("messages", FeatureType.Metered);
	const aiCredit = makeFeature("ai_credits", FeatureType.AiCreditSystem);
	const otherCreditSystem = makeFeature("orbs", FeatureType.CreditSystem);

	test("allows referencing a metered feature", () => {
		expect(() =>
			validateCreditSystemSchemaReferences({
				config: {
					schema: [{ metered_feature_id: "messages", credit_amount: 1 } as any],
					usage_type: FeatureUsageType.Single,
				},
				allFeatures: [metered],
			}),
		).not.toThrow();
	});

	test("allows referencing an AI credit system", () => {
		expect(() =>
			validateCreditSystemSchemaReferences({
				config: {
					schema: [
						{ metered_feature_id: "ai_credits", credit_amount: 1000 } as any,
					],
					usage_type: FeatureUsageType.Single,
				},
				allFeatures: [aiCredit],
			}),
		).not.toThrow();
	});

	test("rejects referencing another credit system (prevents nesting)", () => {
		expect(() =>
			validateCreditSystemSchemaReferences({
				config: {
					schema: [{ metered_feature_id: "orbs", credit_amount: 1 } as any],
					usage_type: FeatureUsageType.Single,
				},
				allFeatures: [otherCreditSystem],
			}),
		).toThrow(/cannot reference another credit system/);
	});

	test("self-reference (id matches selfFeatureId) is tolerated", () => {
		expect(() =>
			validateCreditSystemSchemaReferences({
				config: {
					schema: [{ metered_feature_id: "self_id", credit_amount: 1 } as any],
					usage_type: FeatureUsageType.Single,
				},
				allFeatures: [makeFeature("self_id", FeatureType.CreditSystem)],
				selfFeatureId: "self_id",
			}),
		).not.toThrow();
	});

	test("dangling reference (id not in allFeatures) is tolerated", () => {
		expect(() =>
			validateCreditSystemSchemaReferences({
				config: {
					schema: [
						{ metered_feature_id: "nonexistent", credit_amount: 1 } as any,
					],
					usage_type: FeatureUsageType.Single,
				},
				allFeatures: [],
			}),
		).not.toThrow();
	});
});
