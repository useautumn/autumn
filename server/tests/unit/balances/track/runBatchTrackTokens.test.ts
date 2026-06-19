import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
	BatchTrackParams,
	BatchTrackTokensParams,
	TrackTokensParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const mockState = {
	tokenInputs: [] as TrackTokensParams[],
	batchBodies: [] as BatchTrackParams[],
};

mock.module("@/internal/balances/track/utils/getTokenTrackParams.js", () => ({
	getTokenTrackParams: async ({ input }: { input: TrackTokensParams }) => {
		mockState.tokenInputs.push(input);
		return {
			body: {
				customer_id: input.customer_id,
				entity_id: input.entity_id,
				feature_id: input.feature_id ?? "ai_credits",
				value: 0.5,
				properties: {
					model: input.model_id,
				},
				idempotency_key: input.idempotency_key,
				timestamp: input.timestamp,
			},
			featureDeductions: [],
		};
	},
}));

mock.module("@/internal/balances/track/runBatchTrack.js", () => ({
	runBatchTrack: async ({ body }: { body: BatchTrackParams }) => {
		mockState.batchBodies.push(body);
	},
}));

import { runBatchTrackTokens } from "@/internal/balances/track/runBatchTrackTokens.js";

describe("runBatchTrackTokens", () => {
	beforeEach(() => {
		mockState.tokenInputs = [];
		mockState.batchBodies = [];
	});

	test("converts token items to queued track bodies with per-item idempotency keys", async () => {
		const timestamp = Date.UTC(2026, 5, 19, 12, 0, 0);
		const body: BatchTrackTokensParams = [
			{
				customer_id: "cus_123",
				feature_id: "ai_credits",
				model_id: "openai/gpt-4o",
				input_tokens: 100,
				output_tokens: 20,
				idempotency_key: "token-item-1",
				timestamp,
			},
			{
				customer_id: "cus_456",
				entity_id: "ent_456",
				model_id: "anthropic/claude-opus-4-8",
				input_tokens: 200,
				output_tokens: 30,
				idempotency_key: "token-item-2",
			},
		];

		await runBatchTrackTokens({
			ctx: {} as AutumnContext,
			body,
		});

		expect(mockState.tokenInputs).toEqual(body);
		expect(mockState.batchBodies).toHaveLength(1);
		expect(mockState.batchBodies[0]).toMatchObject([
			{
				customer_id: "cus_123",
				feature_id: "ai_credits",
				idempotency_key: "token-item-1",
				timestamp,
			},
			{
				customer_id: "cus_456",
				entity_id: "ent_456",
				idempotency_key: "token-item-2",
			},
		]);
	});
});
