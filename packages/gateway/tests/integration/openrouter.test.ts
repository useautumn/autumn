import { describe, expect, test } from "bun:test";
import { OpenRouter } from "@openrouter/sdk";
import { withAutumn } from "../../src/openrouter/index.js";
import type { TrackTokensParams } from "../../src/shared/track.js";

const API_KEY = process.env.OPENROUTER_API_KEY;

const RATES: Record<
	string,
	{ input: number; output: number; cacheRead?: number; cacheWrite?: number }
> = {
	"openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
	"anthropic/claude-3.5-haiku": {
		input: 0.8,
		output: 4,
		cacheRead: 0.08,
		cacheWrite: 1,
	},
};

const priceOf = (pools: TrackTokensParams, model: string) => {
	const rate = RATES[model];
	if (!rate) {
		throw new Error(`no rates for ${model}`);
	}
	return (
		(pools.inputTokens * rate.input +
			pools.outputTokens * rate.output +
			pools.cacheReadTokens * (rate.cacheRead ?? rate.input) +
			pools.cacheWriteTokens * (rate.cacheWrite ?? rate.input)) /
		1_000_000
	);
};

const createCapture = () => {
	const calls: TrackTokensParams[] = [];
	return {
		calls,
		autumn: {
			trackTokens: async (params: TrackTokensParams) => {
				calls.push(params);
			},
		},
	};
};

const wrap = (calls: ReturnType<typeof createCapture>) =>
	withAutumn({
		autumn: calls.autumn,
		openRouter: new OpenRouter({ apiKey: API_KEY ?? "" }),
		customerId: "cus_integration_test",
	});

type ChatResult = {
	usage?: {
		promptTokens?: number;
		completionTokens?: number;
		cost?: number | null;
		costDetails?: { upstreamInferenceCost?: number | null } | null;
		promptTokensDetails?: {
			cachedTokens?: number | null;
			cacheWriteTokens?: number | null;
		} | null;
	} | null;
};

describe.skipIf(!API_KEY)("live OpenRouter usage semantics", () => {
	for (const model of ["openai/gpt-4o-mini", "anthropic/claude-3.5-haiku"]) {
		test(`${model}: pools conserve totals and re-price to OpenRouter's cost`, async () => {
			const capture = createCapture();
			const result = (await wrap(capture).chat.send({
				chatRequest: {
					model,
					messages: [{ role: "user", content: "Reply with exactly: ok" }],
					maxTokens: 20,
				},
			})) as ChatResult;

			expect(capture.calls).toHaveLength(1);
			const pools = capture.calls[0] as TrackTokensParams;
			const usage = result.usage;

			expect(
				pools.inputTokens +
					pools.cacheReadTokens +
					pools.cacheWriteTokens +
					(pools.audioInputTokens ?? 0),
			).toBe(usage?.promptTokens ?? -1);
			expect(pools.outputTokens + pools.reasoningTokens).toBe(
				usage?.completionTokens ?? -1,
			);

			const upstream = usage?.costDetails?.upstreamInferenceCost;
			if (upstream) {
				const derived = priceOf(pools, model);
				expect(Math.abs(derived - upstream) / upstream).toBeLessThan(0.02);
			}
		}, 60_000);
	}

	test("anthropic cache_control: write then read, totals stay inclusive", async () => {
		const model = "anthropic/claude-3.5-haiku";
		const prefix = `Run ${crypto.randomUUID()}. ${Array.from(
			{ length: 400 },
			(_, i) =>
				`Clause ${i}: the party of the first part shall deliver widgets to the party of the second part subject to schedule ${i % 7} annex ${i % 3}.`,
		).join(" ")}`;

		const send = async () => {
			const capture = createCapture();
			const result = (await wrap(capture).chat.send({
				chatRequest: {
					model,
					messages: [
						{
							role: "system",
							content: [
								{
									type: "text",
									text: prefix,
									cacheControl: { type: "ephemeral" },
								},
							],
						},
						{ role: "user", content: "Say ok" },
					],
					maxTokens: 20,
				},
			})) as ChatResult;
			return { pools: capture.calls[0] as TrackTokensParams, result };
		};

		const first = await send();
		const second = await send();

		const wrote = first.pools.cacheWriteTokens;
		const read = second.pools.cacheReadTokens;
		expect(wrote).toBeGreaterThan(1_000);
		expect(read).toBeGreaterThan(1_000);

		expect(first.pools.inputTokens).toBeLessThan(100);
		expect(second.pools.inputTokens).toBeLessThan(100);

		for (const { pools, result } of [first, second]) {
			const upstream = result.usage?.costDetails?.upstreamInferenceCost;
			if (upstream) {
				const derived = priceOf(pools, model);
				expect(Math.abs(derived - upstream) / upstream).toBeLessThan(0.02);
			}
		}
	}, 120_000);
});
