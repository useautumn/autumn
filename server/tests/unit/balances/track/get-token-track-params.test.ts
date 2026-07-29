import { describe, expect, mock, test } from "bun:test";
import { FeatureType, type Feature } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

mock.module("@/internal/features/aiCreditSystemUtils.js", () => ({
	getModelCreditCostBreakdown: async () => ({
		cost: 2.5,
		baseCost: 2,
		markup: 25,
		markupSource: "default",
		tierApplied: false,
		rates: {
			input: 1,
			output: 2,
			cacheRead: 0,
			cacheWrite: 0,
			audioInput: 0,
			audioOutput: 0,
			reasoning: 0,
		},
	}),
}));

const { getTokenTrackParams } = await import(
	"@/internal/balances/track/utils/getTokenTrackParams.js"
);

const aiCreditFeature = {
	id: "ai_credits",
	type: FeatureType.AiCreditSystem,
} as unknown as Feature;

const createCtx = (): AutumnContext =>
	({
		features: [aiCreditFeature],
	} as unknown as AutumnContext);

describe("getTokenTrackParams", () => {
	test("forwards a backdated timestamp into the TrackParams body", async () => {
		const timestamp = Date.now() - 10_000;
		const { body } = await getTokenTrackParams({
			ctx: createCtx(),
			input: {
				customer_id: "cus_123",
				feature_id: "ai_credits",
				model_id: "openai/gpt-4.1",
				input_tokens: 100,
				output_tokens: 50,
				timestamp,
			},
		});

		expect(body.timestamp).toBe(timestamp);
	});

	test("leaves timestamp unset when track_tokens omits it", async () => {
		const { body } = await getTokenTrackParams({
			ctx: createCtx(),
			input: {
				customer_id: "cus_123",
				feature_id: "ai_credits",
				model_id: "openai/gpt-4.1",
				input_tokens: 100,
				output_tokens: 50,
			},
		});

		expect(body.timestamp).toBeUndefined();
	});

	test("forwards async passthrough into the TrackParams body", async () => {
		const { body } = await getTokenTrackParams({
			ctx: createCtx(),
			input: {
				customer_id: "cus_123",
				feature_id: "ai_credits",
				model_id: "openai/gpt-4.1",
				input_tokens: 100,
				output_tokens: 50,
				async: true,
				idempotency_key: "token-import-1",
			},
		});

		expect(body.async).toBe(true);
		expect(body.idempotency_key).toBe("token-import-1");
	});

	test("leaves async unset when track_tokens omits it", async () => {
		const { body } = await getTokenTrackParams({
			ctx: createCtx(),
			input: {
				customer_id: "cus_123",
				feature_id: "ai_credits",
				model_id: "openai/gpt-4.1",
				input_tokens: 100,
				output_tokens: 50,
			},
		});

		expect(body.async).toBeUndefined();
	});
});
