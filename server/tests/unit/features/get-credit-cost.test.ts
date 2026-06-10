import { describe, expect, test } from "bun:test";
import {
	ErrCode,
	type Feature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";

// Uses custom/* models so pricing resolves offline (no models.dev fetch).
const CUSTOM_MODEL = "custom/foo";

const aiCreditFeature: Feature = {
	internal_id: "fe_ai_credits",
	org_id: "org_test",
	created_at: Date.now(),
	env: "sandbox" as Feature["env"],
	id: "ai_credits",
	name: "AI Credits",
	type: FeatureType.AiCreditSystem,
	config: { schema: [], usage_type: FeatureUsageType.Single },
	archived: false,
	event_names: [],
	model_markups: {
		[CUSTOM_MODEL]: { markup: 0, input_cost: 1000, output_cost: 2000 },
	},
};

describe("getCreditCost — AI credit system without token context", () => {
	test("self feature with no tokens maps 1:1 (plain /track values, queued replays)", async () => {
		const cost = await getCreditCost({
			featureId: aiCreditFeature.id,
			creditSystem: aiCreditFeature,
			amount: 5.25,
		});
		expect(cost).toBe(5.25);
	});

	test("self feature with no tokens defaults to a per-unit cost of 1", async () => {
		const cost = await getCreditCost({
			featureId: aiCreditFeature.id,
			creditSystem: aiCreditFeature,
		});
		expect(cost).toBe(1);
	});

	test("self feature WITH tokens still prices through the model (not 1:1)", async () => {
		const cost = await getCreditCost({
			featureId: aiCreditFeature.id,
			creditSystem: aiCreditFeature,
			modelName: CUSTOM_MODEL,
			tokens: { input: 1000, output: 500 },
		});
		// (1000 * 1000 + 2000 * 500) / 1_000_000 = 2.0
		expect(cost).toBeCloseTo(2.0, 10);
	});

	test("non-self feature with no tokens throws", async () => {
		expect(
			getCreditCost({
				featureId: "some_other_feature",
				creditSystem: aiCreditFeature,
				amount: 5,
			}),
		).rejects.toMatchObject({
			code: ErrCode.InvalidRequest,
			message: expect.stringContaining("modelName and tokens"),
		});
	});
});
