import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const mockState = {
	queueCalls: [] as Record<string, unknown>[],
};

mock.module("@/queue/queueUtils.js", () => ({
	addTaskToQueue: async (args: Record<string, unknown>) => {
		mockState.queueCalls.push(args);
	},
}));

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
		mockState.queueCalls = [];
		process.env.TRACK_SQS_QUEUE_URL =
			"https://sqs.eu-west-1.amazonaws.com/123456789012/track-dev.fifo";
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

		expect(mockState.queueCalls).toHaveLength(1);
		expect(mockState.queueCalls[0]).toMatchObject({
			queueUrl:
				"https://sqs.eu-west-1.amazonaws.com/123456789012/track-dev.fifo",
			messageGroupId: "org_123:sandbox:cus_123:ent_123",
			messageDeduplicationId: "req_123",
			payload: {
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
		process.env.TRACK_SQS_QUEUE_URL = originalTrackQueueUrl;
	});
});
