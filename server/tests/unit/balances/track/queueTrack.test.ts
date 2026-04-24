import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getSqsClient } from "@/queue/initSqs.js";

const mockState = {
	queueCommands: [] as Record<string, unknown>[],
	originalSend: null as null | SQSClient["send"],
};

mock.module("@/internal/balances/track/utils/getQueuedTrackResponse.js", () => ({
	getQueuedTrackResponse: () => ({
		customer_id: "cus_123",
		value: 2,
		balance: null,
	}),
}));

import { queueTrack } from "@/internal/balances/track/utils/queueTrack.js";

describe("queueTrack", () => {
	const originalTrackQueueUrl = process.env.TRACK_SQS_QUEUE_URL;

	beforeEach(() => {
		mockState.queueCommands = [];
		process.env.TRACK_SQS_QUEUE_URL =
			"https://sqs.eu-west-1.amazonaws.com/123456789012/track-dev.fifo";
		const sqsClient = getSqsClient();
		mockState.originalSend = sqsClient.send.bind(sqsClient);
		sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
			mockState.queueCommands.push(command.input);
			return {};
		}) as typeof sqsClient.send;
	});

	test("queues track with request identity and entity-scoped grouping", async () => {
		const ctx = {
			id: "req_123",
			org: { id: "org_123" },
			env: AppEnv.Sandbox,
			apiVersion: new ApiVersionClass(ApiVersion.V2_1),
			logger: {
				warn: mock(() => {}),
			},
		} as unknown as AutumnContext;

		await queueTrack({
			ctx,
			body: {
				customer_id: "cus_123",
				entity_id: "ent_123",
				feature_id: "messages",
				value: 2,
			},
		});

		expect(mockState.queueCommands).toHaveLength(1);
		expect(mockState.queueCommands[0]).toMatchObject({
			QueueUrl:
				"https://sqs.eu-west-1.amazonaws.com/123456789012/track-dev.fifo",
			MessageGroupId: "org_123:sandbox:cus_123:ent_123",
			MessageDeduplicationId: "req_123",
		});
		expect(JSON.parse(mockState.queueCommands[0]?.MessageBody as string)).toMatchObject({
			name: "track",
			data: {
				orgId: "org_123",
				env: AppEnv.Sandbox,
				customerId: "cus_123",
				entityId: "ent_123",
				requestId: "req_123",
				apiVersion: ApiVersion.V2_1,
			},
		});
	});

	afterEach(() => {
		if (mockState.originalSend) {
			const sqsClient = getSqsClient();
			sqsClient.send = mockState.originalSend as typeof sqsClient.send;
		}
		process.env.TRACK_SQS_QUEUE_URL = originalTrackQueueUrl;
	});
});
