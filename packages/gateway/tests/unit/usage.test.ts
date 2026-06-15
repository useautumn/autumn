import { describe, expect, test } from "bun:test";
import {
	poolsFromParts,
	type TokenParts,
	type TokenPools,
} from "../../src/shared/usage.js";

const MODEL = "openrouter/openai/gpt-test";

const poolSum = (pools: TokenPools) =>
	pools.inputTokens +
	pools.cacheReadTokens +
	pools.cacheWriteTokens +
	(pools.audioInputTokens ?? 0);

describe("poolsFromParts", () => {
	test("subtracts every detail pool out of the inclusive input total", () => {
		expect(
			poolsFromParts(
				{
					totalInput: 100,
					totalOutput: 50,
					cacheRead: 20,
					cacheWrite: 5,
					audioInput: 10,
					reasoning: 30,
				},
				MODEL,
			),
		).toEqual({
			inputTokens: 65, // 100 − 20 − 5 − 10
			outputTokens: 20, // 50 − 30
			cacheReadTokens: 20,
			cacheWriteTokens: 5,
			reasoningTokens: 30,
			audioInputTokens: 10,
		});
	});

	test("conservation: exclusive pools always re-sum to the inclusive totals", () => {
		const fixtures: TokenParts[] = [
			{ totalInput: 1, totalOutput: 1 },
			{ totalInput: 1234, totalOutput: 567, cacheRead: 1000 },
			{ totalInput: 50, totalOutput: 50, cacheRead: 25, cacheWrite: 25 },
			{
				totalInput: 9_999_999,
				totalOutput: 1_000_000,
				cacheRead: 123_456,
				cacheWrite: 7,
				audioInput: 88,
				reasoning: 999_999,
			},
		];
		for (const parts of fixtures) {
			const pools = poolsFromParts(parts, MODEL);
			expect(poolSum(pools)).toBe(parts.totalInput ?? 0);
			expect(pools.outputTokens + pools.reasoningTokens).toBe(
				parts.totalOutput ?? 0,
			);
		}
	});

	test("exclusive text counts win over totals — no double subtraction", () => {
		expect(
			poolsFromParts(
				{
					textInput: 70,
					totalInput: 100,
					textOutput: 40,
					totalOutput: 50,
					cacheRead: 30,
					reasoning: 10,
				},
				MODEL,
			),
		).toMatchObject({ inputTokens: 70, outputTokens: 40 });
	});

	test("zero usage is valid, not missing", () => {
		expect(poolsFromParts({ totalInput: 0, totalOutput: 0 }, MODEL)).toEqual({
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			reasoningTokens: 0,
		});
	});

	test("details exceeding totals clamp to zero, never negative", () => {
		const pools = poolsFromParts(
			{
				totalInput: 10,
				totalOutput: 5,
				cacheRead: 8,
				cacheWrite: 8,
				audioInput: 8,
				reasoning: 9,
			},
			MODEL,
		);
		expect(pools.inputTokens).toBe(0);
		expect(pools.outputTokens).toBe(0);
		// Detail pools still report what the provider claimed
		expect(pools.cacheReadTokens).toBe(8);
		expect(pools.reasoningTokens).toBe(9);
	});

	test("missing input total throws naming the pool and model", () => {
		expect(() => poolsFromParts({ totalOutput: 5 }, MODEL)).toThrow(
			/Input token usage.*gpt-test/,
		);
	});

	test("missing output total throws naming the pool and model", () => {
		expect(() => poolsFromParts({ totalInput: 5 }, MODEL)).toThrow(
			/Output token usage.*gpt-test/,
		);
	});

	test("null totals are treated as missing", () => {
		expect(() =>
			poolsFromParts({ totalInput: null, totalOutput: 5 }, MODEL),
		).toThrow(/Input/);
	});

	test("audio pool key only exists when the provider reports one", () => {
		const withoutAudio = poolsFromParts(
			{ totalInput: 10, totalOutput: 5 },
			MODEL,
		);
		expect("audioInputTokens" in withoutAudio).toBe(false);

		const withZeroAudio = poolsFromParts(
			{ totalInput: 10, totalOutput: 5, audioInput: 0 },
			MODEL,
		);
		expect(withZeroAudio.audioInputTokens).toBe(0);
	});
});
