import { describe, expect, test } from "bun:test";
import {
	ErrCode,
	type Feature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

await mockModuleWithRestore(
	"@/internal/features/utils/getModelPricing.js",
	() => ({
		getModelsDevPricing: async () => ({}),
	}),
);

const { getModelCreditCost, getModelCreditCostBreakdown } = await import(
	"@/internal/features/aiCreditSystemUtils.js"
);
const { getCreditCost } = await import(
	"@/internal/features/creditSystemUtils.js"
);

// custom/* models price from model_markups; pricing data is mocked empty.
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

const graduatedCreditFeature: Feature = {
	...aiCreditFeature,
	internal_id: "fe_credits",
	id: "credits",
	name: "Credits",
	type: FeatureType.CreditSystem,
	config: {
		usage_type: FeatureUsageType.Single,
		schema: [
			{
				metered_feature_id: "messages",
				feature_amount: 100,
				tier_behavior: "graduated",
				tiers: [
					{ to: 10_000, credit_amount: 1 },
					{ to: 50_000, credit_amount: 0.8 },
					{ to: "inf", credit_amount: 0.5 },
				],
			},
		],
	},
	model_markups: null,
};

describe("getCreditCost — graduated rate cards", () => {
	test("charges the marginal cost when usage crosses one tier", () => {
		const cost = getCreditCost({
			featureId: "messages",
			creditSystem: graduatedCreditFeature,
			amount: 100,
			currentUsage: 9_950,
		});

		expect(cost).toBeCloseTo(0.9, 10);
	});

	test("charges the marginal cost when one track crosses multiple tiers", () => {
		const cost = getCreditCost({
			featureId: "messages",
			creditSystem: graduatedCreditFeature,
			amount: 40_200,
			currentUsage: 9_900,
		});

		expect(cost).toBeCloseTo(321.5, 10);
	});

	test("one hundred single-unit tracks equal one hundred-unit track", () => {
		let currentUsage = 9_950;
		let incrementalCost = 0;

		for (let index = 0; index < 100; index++) {
			incrementalCost += getCreditCost({
				featureId: "messages",
				creditSystem: graduatedCreditFeature,
				amount: 1,
				currentUsage,
			});
			currentUsage += 1;
		}

		const batchedCost = getCreditCost({
			featureId: "messages",
			creditSystem: graduatedCreditFeature,
			amount: 100,
			currentUsage: 9_950,
		});

		expect(incrementalCost).toBeCloseTo(batchedCost, 10);
	});

	test("negative usage reverses the same marginal tiers without going below zero", () => {
		expect(
			getCreditCost({
				featureId: "messages",
				creditSystem: graduatedCreditFeature,
				amount: -100,
				currentUsage: 10_050,
			}),
		).toBeCloseTo(-0.9, 10);

		expect(
			getCreditCost({
				featureId: "messages",
				creditSystem: graduatedCreditFeature,
				amount: -100,
				currentUsage: 50,
			}),
		).toBeCloseTo(-0.5, 10);
	});
});

describe("getCreditCost — AI credit system schema math", () => {
	test("self feature maps 1:1 (plain /track values, queued replays)", () => {
		const cost = getCreditCost({
			featureId: aiCreditFeature.id,
			creditSystem: aiCreditFeature,
			amount: 5.25,
		});
		expect(cost).toBe(5.25);
	});

	test("self feature defaults to a per-unit cost of 1", () => {
		const cost = getCreditCost({
			featureId: aiCreditFeature.id,
			creditSystem: aiCreditFeature,
		});
		expect(cost).toBe(1);
	});

	test("non-self feature throws — AI credit systems have no schema", () => {
		expect(() =>
			getCreditCost({
				featureId: "some_other_feature",
				creditSystem: aiCreditFeature,
				amount: 5,
			}),
		).toThrow(/no schema/);
	});
});

describe("getModelCreditCost — token pricing", () => {
	test("prices through the model markup config", async () => {
		const cost = await getModelCreditCost({
			modelName: CUSTOM_MODEL,
			creditSystem: aiCreditFeature,
			input: 1000,
			output: 500,
		});
		// (1000 * 1000 + 2000 * 500) / 1_000_000 = 2.0
		expect(cost).toBeCloseTo(2.0, 10);
	});

	test("custom model without configured costs throws", async () => {
		expect(
			getModelCreditCost({
				modelName: "custom/unconfigured",
				creditSystem: aiCreditFeature,
				input: 100,
				output: 50,
			}),
		).rejects.toMatchObject({
			code: ErrCode.InvalidRequest,
		});
	});
});

describe("getModelCreditCostBreakdown — pricing audit trail", () => {
	test("records base cost, markup source, and effective rates", async () => {
		const withMarkup: Feature = {
			...aiCreditFeature,
			model_markups: {
				[CUSTOM_MODEL]: { markup: 50, input_cost: 1000, output_cost: 2000 },
			},
		};
		const breakdown = await getModelCreditCostBreakdown({
			modelName: CUSTOM_MODEL,
			creditSystem: withMarkup,
			input: 1000,
			output: 500,
		});

		expect(breakdown.baseCost).toBeCloseTo(2.0, 10);
		expect(breakdown.cost).toBeCloseTo(3.0, 10);
		expect(breakdown.markup).toBe(50);
		expect(breakdown.markupSource).toBe("model");
		expect(breakdown.tierApplied).toBe(false);
		expect(breakdown.rates.input).toBe(1000);
		expect(breakdown.rates.output).toBe(2000);
		// Unpublished pools fall back to the text rates.
		expect(breakdown.rates.cacheRead).toBe(1000);
		expect(breakdown.rates.reasoning).toBe(2000);
	});

	test("explicit markup 0 reports source model; no markup anywhere reports none", async () => {
		const explicitZero = await getModelCreditCostBreakdown({
			modelName: CUSTOM_MODEL,
			creditSystem: aiCreditFeature,
			input: 1000,
			output: 500,
		});
		expect(explicitZero.markup).toBe(0);
		expect(explicitZero.markupSource).toBe("model");

		const unconfigured = await getModelCreditCostBreakdown({
			modelName: CUSTOM_MODEL,
			creditSystem: {
				...aiCreditFeature,
				model_markups: {
					[CUSTOM_MODEL]: { input_cost: 1000, output_cost: 2000 },
				},
			},
			input: 1000,
			output: 500,
		});
		expect(unconfigured.markup).toBe(0);
		expect(unconfigured.markupSource).toBe("none");
	});

	test("reports provider and default markup sources", async () => {
		const noModelMarkup: Feature = {
			...aiCreditFeature,
			config: {
				schema: [],
				usage_type: FeatureUsageType.Single,
				default_markup: 10,
				provider_markups: { custom: { markup: 20 } },
			},
			model_markups: {
				[CUSTOM_MODEL]: { input_cost: 1000, output_cost: 2000 },
			},
		};

		const provider = await getModelCreditCostBreakdown({
			modelName: CUSTOM_MODEL,
			creditSystem: noModelMarkup,
			input: 1000,
			output: 500,
		});
		expect(provider.markup).toBe(20);
		expect(provider.markupSource).toBe("provider");

		const defaultOnly = await getModelCreditCostBreakdown({
			modelName: CUSTOM_MODEL,
			creditSystem: {
				...noModelMarkup,
				config: {
					schema: [],
					usage_type: FeatureUsageType.Single,
					default_markup: 10,
				},
			},
			input: 1000,
			output: 500,
		});
		expect(defaultOnly.markup).toBe(10);
		expect(defaultOnly.markupSource).toBe("default");
	});
});
