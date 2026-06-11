import { describe, expect, test } from "bun:test";
import { normalizeUsage } from "../../src/usage.js";

const MODEL = "openai/gpt-test";

describe("normalizeUsage", () => {
	test("nested V3 counts split into exclusive pools", () => {
		expect(
			normalizeUsage(
				{
					inputTokens: { total: 13, noCache: 10, cacheRead: 2, cacheWrite: 1 },
					outputTokens: { total: 7, text: 5, reasoning: 2 },
				},
				MODEL,
			),
		).toEqual({
			inputTokens: 10,
			outputTokens: 5,
			cacheReadTokens: 2,
			cacheWriteTokens: 1,
			reasoningTokens: 2,
		});
	});

	test("nested totals without breakdowns derive text pools", () => {
		expect(
			normalizeUsage(
				{
					inputTokens: { total: 13, cacheRead: 2, cacheWrite: 1 },
					outputTokens: { total: 7, reasoning: 2 },
				},
				MODEL,
			),
		).toEqual({
			inputTokens: 10,
			outputTokens: 5,
			cacheReadTokens: 2,
			cacheWriteTokens: 1,
			reasoningTokens: 2,
		});
	});

	test("flat counts with token details", () => {
		expect(
			normalizeUsage(
				{
					inputTokens: 13,
					outputTokens: 7,
					inputTokenDetails: { cacheReadTokens: 2, cacheWriteTokens: 1 },
					outputTokenDetails: { reasoningTokens: 2 },
				},
				MODEL,
			),
		).toEqual({
			inputTokens: 10,
			outputTokens: 5,
			cacheReadTokens: 2,
			cacheWriteTokens: 1,
			reasoningTokens: 2,
		});
	});

	test("legacy prompt/completion counts", () => {
		expect(
			normalizeUsage(
				{ promptTokens: 100, completionTokens: { total: 50 } },
				MODEL,
			),
		).toEqual({
			inputTokens: 100,
			outputTokens: 50,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			reasoningTokens: 0,
		});
	});

	test("inconsistent totals clamp to zero instead of going negative", () => {
		const pools = normalizeUsage(
			{
				inputTokens: { total: 1, cacheRead: 5, cacheWrite: 0 },
				outputTokens: { total: 1, reasoning: 5 },
			},
			MODEL,
		);
		expect(pools.inputTokens).toBe(0);
		expect(pools.outputTokens).toBe(0);
	});

	test("missing usage throws with the model name", () => {
		expect(() => normalizeUsage({}, MODEL)).toThrow(/gpt-test/);
	});
});
