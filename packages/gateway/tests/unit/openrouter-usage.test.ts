import { describe, expect, test } from "bun:test";
import { normalizeOpenRouterUsage } from "../../src/openrouter/usage.js";

const MODEL = "openrouter/openai/gpt-test";

// OpenRouter usage arrives in four dialects: chat completions vs responses
// API, each as SDK camelCase or raw snake_case. All four must normalize to
// identical exclusive pools.
describe("normalizeOpenRouterUsage shape matrix", () => {
	const expected = {
		inputTokens: 82, // 100 − 15 (cached) − 2 (cache write) − 1 (audio)
		outputTokens: 37, // 40 − 3 (reasoning)
		cacheReadTokens: 15,
		cacheWriteTokens: 2,
		reasoningTokens: 3,
		audioInputTokens: 1,
	};

	test("chat completions, SDK camelCase", () => {
		expect(
			normalizeOpenRouterUsage(
				{
					promptTokens: 100,
					completionTokens: 40,
					promptTokensDetails: {
						cachedTokens: 15,
						cacheWriteTokens: 2,
						audioTokens: 1,
					},
					completionTokensDetails: { reasoningTokens: 3 },
				},
				MODEL,
			),
		).toEqual(expected);
	});

	test("chat completions, raw snake_case", () => {
		expect(
			normalizeOpenRouterUsage(
				{
					prompt_tokens: 100,
					completion_tokens: 40,
					prompt_tokens_details: {
						cached_tokens: 15,
						cache_write_tokens: 2,
						audio_tokens: 1,
					},
					completion_tokens_details: { reasoning_tokens: 3 },
				},
				MODEL,
			),
		).toEqual(expected);
	});

	test("responses API, SDK camelCase", () => {
		expect(
			normalizeOpenRouterUsage(
				{
					inputTokens: 100,
					outputTokens: 40,
					inputTokensDetails: {
						cachedTokens: 15,
						cacheWriteTokens: 2,
						audioTokens: 1,
					},
					outputTokensDetails: { reasoningTokens: 3 },
				},
				MODEL,
			),
		).toEqual(expected);
	});

	test("responses API, raw snake_case", () => {
		expect(
			normalizeOpenRouterUsage(
				{
					input_tokens: 100,
					output_tokens: 40,
					input_tokens_details: {
						cached_tokens: 15,
						cache_write_tokens: 2,
						audio_tokens: 1,
					},
					output_tokens_details: { reasoning_tokens: 3 },
				},
				MODEL,
			),
		).toEqual(expected);
	});
});

describe("normalizeOpenRouterUsage edge cases", () => {
	test("chat naming wins over responses naming when both are present", () => {
		const pools = normalizeOpenRouterUsage(
			{ promptTokens: 100, inputTokens: 999, completionTokens: 40 },
			MODEL,
		);
		expect(pools.inputTokens).toBe(100);
	});

	test("missing details default to zero pools", () => {
		expect(
			normalizeOpenRouterUsage(
				{ promptTokens: 10, completionTokens: 5 },
				MODEL,
			),
		).toEqual({
			inputTokens: 10,
			outputTokens: 5,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			reasoningTokens: 0,
			audioInputTokens: 0,
		});
	});

	test("null detail objects are tolerated", () => {
		const pools = normalizeOpenRouterUsage(
			{
				prompt_tokens: 10,
				completion_tokens: 5,
				prompt_tokens_details: null,
				completion_tokens_details: null,
			},
			MODEL,
		);
		expect(pools.inputTokens).toBe(10);
		expect(pools.outputTokens).toBe(5);
	});

	test("zero usage normalizes without throwing", () => {
		const pools = normalizeOpenRouterUsage(
			{ prompt_tokens: 0, completion_tokens: 0 },
			MODEL,
		);
		expect(pools.inputTokens).toBe(0);
		expect(pools.outputTokens).toBe(0);
	});

	test("cost is billing metadata, not a token pool", () => {
		const pools = normalizeOpenRouterUsage(
			{ promptTokens: 10, completionTokens: 5, cost: 0.42 },
			MODEL,
		);
		expect(Object.values(pools).every((v) => typeof v === "number")).toBe(
			true,
		);
		expect(pools.inputTokens).toBe(10);
	});

	test("missing prompt count throws naming Input and the model", () => {
		expect(() =>
			normalizeOpenRouterUsage({ completionTokens: 5 }, MODEL),
		).toThrow(/Input token usage.*gpt-test/);
	});

	test("missing completion count throws naming Output", () => {
		expect(() =>
			normalizeOpenRouterUsage({ promptTokens: 5 }, MODEL),
		).toThrow(/Output token usage/);
	});

	test("cached-heavy prompt: cache read dominates, text input clamps cleanly", () => {
		// 95% cache hit — common for agent loops re-sending big system prompts
		expect(
			normalizeOpenRouterUsage(
				{
					prompt_tokens: 10_000,
					completion_tokens: 200,
					prompt_tokens_details: { cached_tokens: 9_500 },
				},
				MODEL,
			),
		).toMatchObject({
			inputTokens: 500,
			cacheReadTokens: 9_500,
		});
	});
});
