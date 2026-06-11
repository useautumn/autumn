import { describe, expect, test } from "bun:test";
import {
	type Feature,
	FeatureType,
	FeatureUsageType,
	type ModelMarkups,
	type ProviderMarkups,
} from "@autumn/shared";
import { getModelCreditCost } from "@/internal/features/aiCreditSystemUtils.js";

// Custom models carry their own input/output costs, so getModelCreditCost
// resolves them without hitting the models.dev pricing fetch — ideal for
// unit-testing the tiered markup resolution (model > provider > global > none).
const CUSTOM_MODEL = "custom/foo";
const TOKENS = { input: 1000, output: 500 };
// base cost = (1000 * 1000 + 500 * 2000) / 1_000_000 = 2.0
const BASE_COST = 2.0;
const INPUT_COST = 1000;
const OUTPUT_COST = 2000;

const makeAiCredit = ({
	model_markups,
	default_markup,
	provider_markups,
}: {
	model_markups: ModelMarkups;
	default_markup?: number;
	provider_markups?: ProviderMarkups;
}): Feature => ({
	internal_id: "fe_ai_credits",
	org_id: "org_test",
	created_at: Date.now(),
	env: "sandbox" as Feature["env"],
	id: "ai_credits",
	name: "AI Credits",
	type: FeatureType.AiCreditSystem,
	config: {
		schema: [],
		usage_type: FeatureUsageType.Single,
		default_markup,
		provider_markups,
	},
	archived: false,
	event_names: [],
	model_markups,
});

const cost = (creditSystem: Feature) =>
	getModelCreditCost({
		modelName: CUSTOM_MODEL,
		creditSystem,
		...TOKENS,
	});

describe("getModelCreditCost — tiered AI markup resolution", () => {
	test("per-model markup wins over provider and global", async () => {
		const creditSystem = makeAiCredit({
			model_markups: {
				[CUSTOM_MODEL]: {
					input_cost: INPUT_COST,
					output_cost: OUTPUT_COST,
					markup: 50,
				},
			},
			provider_markups: { custom: { markup: 20 } },
			default_markup: 10,
		});
		expect(await cost(creditSystem)).toBeCloseTo(BASE_COST * 1.5);
	});

	test("falls back to provider markup when model markup is omitted", async () => {
		const creditSystem = makeAiCredit({
			model_markups: {
				[CUSTOM_MODEL]: { input_cost: INPUT_COST, output_cost: OUTPUT_COST },
			},
			provider_markups: { custom: { markup: 20 } },
			default_markup: 10,
		});
		expect(await cost(creditSystem)).toBeCloseTo(BASE_COST * 1.2);
	});

	test("falls back to global default markup when model and provider are omitted", async () => {
		const creditSystem = makeAiCredit({
			model_markups: {
				[CUSTOM_MODEL]: { input_cost: INPUT_COST, output_cost: OUTPUT_COST },
			},
			default_markup: 10,
		});
		expect(await cost(creditSystem)).toBeCloseTo(BASE_COST * 1.1);
	});

	test("bills at base cost (1:1) when no markup is configured anywhere", async () => {
		const creditSystem = makeAiCredit({
			model_markups: {
				[CUSTOM_MODEL]: { input_cost: INPUT_COST, output_cost: OUTPUT_COST },
			},
		});
		expect(await cost(creditSystem)).toBeCloseTo(BASE_COST);
	});

	test("explicit per-model markup of 0 overrides provider and global", async () => {
		const creditSystem = makeAiCredit({
			model_markups: {
				[CUSTOM_MODEL]: {
					input_cost: INPUT_COST,
					output_cost: OUTPUT_COST,
					markup: 0,
				},
			},
			provider_markups: { custom: { markup: 20 } },
			default_markup: 10,
		});
		expect(await cost(creditSystem)).toBeCloseTo(BASE_COST);
	});
});
