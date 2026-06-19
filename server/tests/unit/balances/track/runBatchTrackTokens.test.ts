import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type {
	BatchTrackTokensParams,
} from "@autumn/shared";
import { ApiVersion, ApiVersionClass, AppEnv, FeatureType } from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getSqsClient } from "@/queue/initSqs.js";

const mockState = {
	modelNames: [] as string[],
	queueCommands: [] as Record<string, unknown>[],
	originalSend: null as null | SQSClient["send"],
};

const trackAsyncQueueUrl =
	"https://sqs.eu-west-1.amazonaws.com/123456789012/track-async-dev.fifo";

mock.module("@/internal/features/aiCreditSystemUtils.js", () => ({
	getModelCreditCostBreakdown: async ({
		modelName,
	}: {
		modelName: string;
	}) => {
		mockState.modelNames.push(modelName);
		return {
			cost: 0.5,
			baseCost: 0.4,
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
		};
	},
}));

import { runBatchTrackTokens } from "@/internal/balances/track/runBatchTrackTokens.js";

const buildCtx = () =>
	({
		id: "req_batch_tokens_1",
		org: { id: "org_123" },
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		features: [{ id: "ai_credits", type: FeatureType.AiCreditSystem }],
		logger: {
			error: mock(() => {}),
			warn: mock(() => {}),
		},
	}) as unknown as AutumnContext;

describe("runBatchTrackTokens", () => {
	const originalEnv = process.env.TRACK_ASYNC_SQS_QUEUE_URL;

	beforeEach(() => {
		mockState.modelNames = [];
		mockState.queueCommands = [];
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = trackAsyncQueueUrl;

		const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
		mockState.originalSend = sqsClient.send.bind(sqsClient);
		sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
			mockState.queueCommands.push(command.input);
			return {
				Successful: ((command.input.Entries as Array<{ Id: string }>) ?? []).map(
					(entry) => ({ Id: entry.Id }),
				),
			};
		}) as typeof sqsClient.send;
	});

	afterEach(() => {
		if (mockState.originalSend) {
			const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
			sqsClient.send = mockState.originalSend as typeof sqsClient.send;
			mockState.originalSend = null;
		}
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = originalEnv;
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
				feature_id: "ai_credits",
				model_id: "anthropic/claude-opus-4-8",
				input_tokens: 200,
				output_tokens: 30,
				idempotency_key: "token-item-2",
			},
		];

		await runBatchTrackTokens({
			ctx: buildCtx(),
			body,
		});

		expect(mockState.modelNames).toEqual([
			"openai/gpt-4o",
			"anthropic/claude-opus-4-8",
		]);
		expect(mockState.queueCommands).toHaveLength(1);
		const entries = mockState.queueCommands[0]?.Entries as Array<{
			MessageBody: string;
			MessageDeduplicationId: string;
		}>;
		expect(entries).toHaveLength(2);
		expect(entries.map((entry) => entry.MessageDeduplicationId)).toEqual([
			"req_batch_tokens_1-0",
			"req_batch_tokens_1-1",
		]);
		expect(entries.map((entry) => JSON.parse(entry.MessageBody).data.body))
			.toMatchObject([
			{
				customer_id: "cus_123",
				feature_id: "ai_credits",
				value: 0.5,
				idempotency_key: "token-item-1",
				timestamp,
			},
			{
				customer_id: "cus_456",
				entity_id: "ent_456",
				feature_id: "ai_credits",
				value: 0.5,
				idempotency_key: "token-item-2",
			},
		]);
	});
});
