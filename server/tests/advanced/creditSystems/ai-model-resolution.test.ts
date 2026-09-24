import { describe, expect, mock, test } from "bun:test";
import {
	type Feature,
	FeatureType,
	FeatureUsageType,
	type ModelMarkups,
	type ModelsDevCost,
	type ModelsDevModel,
	type ModelsDevProvider,
} from "@autumn/shared";

// Stub the models.dev fetch so resolution + pricing are deterministic and offline.
const pricingData: Record<string, ModelsDevProvider> = {
	anthropic: {
		id: "anthropic",
		name: "Anthropic",
		models: {
			"claude-opus-4-5": {
				id: "claude-opus-4-5",
				name: "Claude Opus 4.5",
				cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
			},
			"claude-3-5-haiku-20241022": {
				id: "claude-3-5-haiku-20241022",
				name: "Claude 3.5 Haiku",
				cost: { input: 1, output: 5 },
			},
		},
	},
	openai: {
		id: "openai",
		name: "OpenAI",
		models: {
			"gpt-4o-2024-08-06": {
				id: "gpt-4o-2024-08-06",
				name: "GPT-4o",
				cost: { input: 2.5, output: 10, cache_read: 1.25 },
			},
			"gpt-5": {
				id: "gpt-5",
				name: "GPT-5",
				cost: {
					input: 1,
					output: 2,
					cache_read: 0.5,
					tiers: [
						{
							input: 2,
							output: 4,
							cache_read: 1,
							tier: { type: "context", size: 200_000 },
						},
					],
					context_over_200k: { input: 2, output: 4, cache_read: 1 },
				},
			},
			"omni-audio": {
				id: "omni-audio",
				name: "Omni Audio",
				cost: {
					input: 2,
					output: 4,
					input_audio: 3.5,
					output_audio: 7,
					reasoning: 10,
				},
			},
			"no-cache-model": {
				id: "no-cache-model",
				name: "No Cache",
				cost: { input: 10, output: 20 },
			},
		},
	},
	"nano-gpt": {
		id: "nano-gpt",
		name: "NanoGPT",
		models: {
			// Decision-type model from models.dev's ?type=all feed: sub-cent input, free output.
			"typesafe/jev-latest": {
				id: "typesafe/jev-latest",
				name: "Jev",
				cost: { input: 0.042, output: 0, cache_read: 0.021 },
			},
		},
	},
	"alibaba-cn": {
		id: "alibaba-cn",
		name: "Alibaba (China)",
		models: {
			"qwen-tiered": {
				id: "qwen-tiered",
				name: "Qwen Tiered",
				cost: {
					input: 1,
					output: 2,
					reasoning: 2,
					input_audio: 3,
					tiers: [
						{
							input: 4,
							output: 8,
							reasoning: 8,
							input_audio: 12,
							tier: { type: "context", size: 128_000 },
						},
					],
				},
			},
		},
	},
	unsupported: {
		id: "unsupported",
		name: "Unsupported pricing shapes",
		models: {
			"no-cost": { id: "no-cost", name: "No Cost" } as ModelsDevModel,
			"unknown-cache-rate": {
				id: "unknown-cache-rate",
				name: "Unknown Cache Rate",
				cost: { input: 1, output: 2, cache_write_1h: 5 } as ModelsDevCost,
			},
			"object-cache-rate": {
				id: "object-cache-rate",
				name: "Object Cache Rate",
				cost: {
					input: 1,
					output: 2,
					cache_read: { "5m": 0.1, "1h": 0.2 },
				} as unknown as ModelsDevCost,
			},
			"time-of-day-tier": {
				id: "time-of-day-tier",
				name: "Time Of Day Tier",
				cost: {
					input: 1,
					output: 2,
					tiers: [
						{ input: 0.5, output: 1, tier: { type: "off_peak", size: 0 } },
					],
				},
			},
			"per-image": {
				id: "per-image",
				name: "Per Image",
				cost: { input: 1, output: 2, per_image: 0.04 } as ModelsDevCost,
			},
		},
	},
	openrouter: {
		id: "openrouter",
		name: "OpenRouter",
		models: {
			// Openrouter keys contain a subprovider slash; the id keeps it after the
			// first `/` split (openrouter/openai/gpt-4o-2024-08-06).
			"openai/gpt-4o-2024-08-06": {
				id: "openai/gpt-4o-2024-08-06",
				name: "GPT-4o (OpenRouter)",
				cost: { input: 3, output: 12 },
			},
		},
	},
};

mock.module("@/internal/features/utils/getModelPricing.js", () => ({
	getModelsDevPricing: async () => pricingData,
}));

const { getModelCreditCost, getModelCreditCostBreakdown } = await import(
	"@/internal/features/aiCreditSystemUtils.js"
);

const makeFeature = (model_markups: ModelMarkups = {}): Feature => ({
	internal_id: "fe_ai",
	org_id: "org_test",
	created_at: Date.now(),
	env: "sandbox" as Feature["env"],
	id: "ai_credits",
	name: "AI Credits",
	type: FeatureType.AiCreditSystem,
	config: { schema: [], usage_type: FeatureUsageType.Single },
	archived: false,
	event_names: [],
	model_markups,
});

const PER_MILLION = 1_000_000;

describe("resolveModel — exact match", () => {
	test("exact provider-scoped match", async () => {
		const cost = await getModelCreditCost({
			modelName: "anthropic/claude-opus-4-5",
			creditSystem: makeFeature(),
			input: 1000,
			output: 500,
		});
		expect(cost).toBeCloseTo((5 * 1000 + 25 * 500) / PER_MILLION, 10);
	});

	test("openrouter slug keeps its inner slash (split on the first '/')", async () => {
		const cost = await getModelCreditCost({
			modelName: "openrouter/openai/gpt-4o-2024-08-06",
			creditSystem: makeFeature(),
			input: 1000,
			output: 0,
		});
		// openrouter's own rate (3), not openai's direct rate (2.5).
		expect(cost).toBeCloseTo((3 * 1000) / PER_MILLION, 10);
	});

	test("throws when the model key does not match exactly", async () => {
		expect(
			getModelCreditCost({
				modelName: "anthropic/claude-3-5-haiku",
				creditSystem: makeFeature(),
				input: 1,
				output: 1,
			}),
		).rejects.toThrow(/not found/);
	});

	test("throws for a bare name with no provider", async () => {
		expect(
			getModelCreditCost({
				modelName: "gpt-4o",
				creditSystem: makeFeature(),
				input: 1,
				output: 1,
			}),
		).rejects.toThrow(/not found/);
	});
});

describe("computeCost — token pools", () => {
	test("bills cache read/write at their own rates", async () => {
		const cost = await getModelCreditCost({
			modelName: "anthropic/claude-opus-4-5",
			creditSystem: makeFeature(),
			input: 1000,
			output: 500,
			cacheRead: 2000,
			cacheWrite: 100,
		});
		const expected =
			(5 * 1000 + 25 * 500 + 0.5 * 2000 + 6.25 * 100) / PER_MILLION;
		expect(cost).toBeCloseTo(expected, 10);
	});

	test("uses the long-context tier once the input exceeds the threshold", async () => {
		const large = await getModelCreditCost({
			modelName: "openai/gpt-5",
			creditSystem: makeFeature(),
			input: 300_000,
			output: 1000,
		});
		expect(large).toBeCloseTo((2 * 300_000 + 4 * 1000) / PER_MILLION, 10);

		const small = await getModelCreditCost({
			modelName: "openai/gpt-5",
			creditSystem: makeFeature(),
			input: 100_000,
			output: 1000,
		});
		expect(small).toBeCloseTo((1 * 100_000 + 2 * 1000) / PER_MILLION, 10);
	});

	test("bills cache at the tier rate above the context threshold", async () => {
		const above = await getModelCreditCost({
			modelName: "openai/gpt-5",
			creditSystem: makeFeature(),
			input: 300_000,
			output: 0,
			cacheRead: 1000,
		});
		// totalInput 301k > 200k -> tier input (2) and tier cache_read (1), not base 0.5.
		expect(above).toBeCloseTo((2 * 300_000 + 1 * 1000) / PER_MILLION, 10);

		const below = await getModelCreditCost({
			modelName: "openai/gpt-5",
			creditSystem: makeFeature(),
			input: 1000,
			output: 0,
			cacheRead: 1000,
		});
		// totalInput 2k < 200k -> base input (1) and base cache_read (0.5).
		expect(below).toBeCloseTo((1 * 1000 + 0.5 * 1000) / PER_MILLION, 10);
	});

	test("bills audio and reasoning pools at their modality rates", async () => {
		const cost = await getModelCreditCost({
			modelName: "openai/omni-audio",
			creditSystem: makeFeature(),
			input: 1000,
			output: 500,
			audioInput: 200,
			audioOutput: 100,
			reasoning: 50,
		});
		const expected =
			(2 * 1000 + 4 * 500 + 3.5 * 200 + 7 * 100 + 10 * 50) / PER_MILLION;
		expect(cost).toBeCloseTo(expected, 10);
	});

	test("falls back to the base input rate for missing cache rates", async () => {
		const cost = await getModelCreditCost({
			modelName: "openai/no-cache-model",
			creditSystem: makeFeature(),
			input: 0,
			output: 0,
			cacheRead: 1000,
		});
		// no published cache_read rate -> bill at the base input rate (10)
		expect(cost).toBeCloseTo((10 * 1000) / PER_MILLION, 10);
	});

	test("applies markup to the full total", async () => {
		const cost = await getModelCreditCost({
			modelName: "anthropic/claude-opus-4-5",
			creditSystem: makeFeature({
				"anthropic/claude-opus-4-5": { markup: 50 },
			}),
			input: 1000,
			output: 500,
		});
		expect(cost).toBeCloseTo(((5 * 1000 + 25 * 500) / PER_MILLION) * 1.5, 10);
	});

	test("breakdown reports tier_applied and the tier rates actually used", async () => {
		const above = await getModelCreditCostBreakdown({
			modelName: "openai/gpt-5",
			creditSystem: makeFeature(),
			input: 300_000,
			output: 1000,
		});
		expect(above.tierApplied).toBe(true);
		expect(above.rates.input).toBe(2);
		expect(above.rates.cacheRead).toBe(1);
		expect(above.baseCost).toBeCloseTo(
			(2 * 300_000 + 4 * 1000) / PER_MILLION,
			10,
		);
		expect(above.cost).toBe(above.baseCost);

		const below = await getModelCreditCostBreakdown({
			modelName: "openai/gpt-5",
			creditSystem: makeFeature(),
			input: 1000,
			output: 1000,
		});
		expect(below.tierApplied).toBe(false);
		expect(below.rates.input).toBe(1);
	});
});

describe("full models.dev feed — decision models", () => {
	test("prices a sub-cent input rate with a free output rate exactly", async () => {
		const breakdown = await getModelCreditCostBreakdown({
			modelName: "nano-gpt/typesafe/jev-latest",
			creditSystem: makeFeature(),
			input: 1_000_000_000,
			output: 5000,
			cacheRead: 1_000_000,
		});
		expect(breakdown.rates.output).toBe(0);
		expect(breakdown.baseCost).toBe(42 + 0.021);
	});

	test("the lab-level id without a hosting provider is still not found", async () => {
		expect(
			getModelCreditCost({
				modelName: "typesafe/jev-latest",
				creditSystem: makeFeature(),
				input: 1,
				output: 1,
			}),
		).rejects.toThrow(/not found/);
	});
});

describe("context tiers — reasoning and audio input rates", () => {
	test("bills reasoning and audio input at the tier rate above the threshold", async () => {
		const breakdown = await getModelCreditCostBreakdown({
			modelName: "alibaba-cn/qwen-tiered",
			creditSystem: makeFeature(),
			input: 200_000,
			output: 1000,
			reasoning: 1000,
			audioInput: 1000,
		});
		expect(breakdown.tierApplied).toBe(true);
		expect(breakdown.rates.reasoning).toBe(8);
		expect(breakdown.rates.audioInput).toBe(12);
		expect(breakdown.baseCost).toBeCloseTo(
			(4 * 200_000 + 8 * 1000 + 8 * 1000 + 12 * 1000) / PER_MILLION,
			10,
		);
	});

	test("keeps base reasoning and audio input rates below the threshold", async () => {
		const breakdown = await getModelCreditCostBreakdown({
			modelName: "alibaba-cn/qwen-tiered",
			creditSystem: makeFeature(),
			input: 1000,
			output: 0,
			reasoning: 1000,
			audioInput: 1000,
		});
		expect(breakdown.tierApplied).toBe(false);
		expect(breakdown.rates.reasoning).toBe(2);
		expect(breakdown.rates.audioInput).toBe(3);
	});
});

describe("unsupported pricing shapes are rejected, never guessed", () => {
	for (const modelKey of [
		"no-cost",
		"unknown-cache-rate",
		"object-cache-rate",
		"time-of-day-tier",
		"per-image",
	]) {
		test(`rejects ${modelKey} with a 400`, async () => {
			expect(
				getModelCreditCost({
					modelName: `unsupported/${modelKey}`,
					creditSystem: makeFeature(),
					input: 1000,
					output: 1000,
				}),
			).rejects.toMatchObject({
				statusCode: 400,
				message: expect.stringContaining("pricing structure"),
			});
		});
	}
});
