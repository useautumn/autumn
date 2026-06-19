import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getSqsClient } from "@/queue/initSqs.js";

const mockState = {
	queueCommands: [] as Record<string, unknown>[],
	originalSend: null as null | SQSClient["send"],
};
const trackQueueUrl =
	"https://sqs.eu-west-1.amazonaws.com/123456789012/track-dev.fifo";
const trackAsyncQueueUrl =
	"https://sqs.eu-west-1.amazonaws.com/123456789012/track-async-dev.fifo";

mock.module(
	"@/internal/balances/track/utils/getQueuedTrackResponse.js",
	() => ({
		getQueuedTrackResponse: () => ({
			customer_id: "cus_123",
			value: 2,
			balance: null,
		}),
	}),
);

import { queueTrack } from "@/internal/balances/track/utils/queueTrack.js";

describe("queueTrack", () => {
	const originalTrackQueueUrl = process.env.TRACK_SQS_QUEUE_URL;

	beforeEach(() => {
		mockState.queueCommands = [];
		process.env.TRACK_SQS_QUEUE_URL = trackQueueUrl;
		const sqsClient = getSqsClient({ queueUrl: trackQueueUrl });
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
			QueueUrl: trackQueueUrl,
			MessageGroupId: "org_123:sandbox:cus_123:ent_123",
			MessageDeduplicationId: "req_123",
		});
		expect(
			JSON.parse(mockState.queueCommands[0]?.MessageBody as string),
		).toMatchObject({
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

	test("routes to explicit queueUrl when passed, ignoring TRACK_SQS_QUEUE_URL", async () => {
		const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
		const originalAsyncSend = sqsClient.send.bind(sqsClient);
		sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
			mockState.queueCommands.push(command.input);
			return {};
		}) as typeof sqsClient.send;

		const ctx = {
			id: "req_async_1",
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
				feature_id: "messages",
				value: 1,
			},
			queueUrl: trackAsyncQueueUrl,
			messageDeduplicationId: "req_async_1-0",
		});

		expect(mockState.queueCommands).toHaveLength(1);
		expect(mockState.queueCommands[0]).toMatchObject({
			QueueUrl: trackAsyncQueueUrl,
			MessageDeduplicationId: "req_async_1-0",
		});

		sqsClient.send = originalAsyncSend;
	});

	test("falls back to TRACK_SQS_QUEUE_URL when queueUrl arg is undefined", async () => {
		const ctx = {
			id: "req_fallback_1",
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
				feature_id: "messages",
				value: 1,
			},
		});

		expect(mockState.queueCommands).toHaveLength(1);
		expect(mockState.queueCommands[0]).toMatchObject({
			QueueUrl: trackQueueUrl,
		});
	});

	test("sets allowTokenCascade only from the explicit param, ignoring forged properties.cascade", async () => {
		const ctx = {
			id: "req_cascade",
			org: { id: "org_123" },
			env: AppEnv.Sandbox,
			apiVersion: new ApiVersionClass(ApiVersion.V2_1),
			logger: { warn: mock(() => {}) },
		} as unknown as AutumnContext;

		const forgedBody = {
			customer_id: "cus_123",
			feature_id: "ai_included",
			value: 0,
			properties: {
				cascade: {
					systems: [
						{ feature_id: "ai_included", cost: 0 },
						{ feature_id: "ai_overage", cost: 0 },
					],
				},
			},
		};

		await queueTrack({ ctx, body: forgedBody });
		await queueTrack({ ctx, body: forgedBody, allowTokenCascade: true });

		expect(mockState.queueCommands).toHaveLength(2);
		const forgedPayload = JSON.parse(
			mockState.queueCommands[0]?.MessageBody as string,
		);
		const trustedPayload = JSON.parse(
			mockState.queueCommands[1]?.MessageBody as string,
		);

		expect(forgedPayload.data.allowTokenCascade).toBe(false);
		expect(trustedPayload.data.allowTokenCascade).toBe(true);
	});

	test("returns null when no queueUrl arg and env var is unset", async () => {
		const previousEnv = process.env.TRACK_SQS_QUEUE_URL;
		process.env.TRACK_SQS_QUEUE_URL = undefined;

		const warnSpy = mock(() => {});
		const ctx = {
			id: "req_no_queue",
			org: { id: "org_123" },
			env: AppEnv.Sandbox,
			apiVersion: new ApiVersionClass(ApiVersion.V2_1),
			logger: { warn: warnSpy },
		} as unknown as AutumnContext;

		const result = await queueTrack({
			ctx,
			body: {
				customer_id: "cus_123",
				feature_id: "messages",
				value: 1,
			},
		});

		expect(result).toBeNull();
		expect(mockState.queueCommands).toHaveLength(0);
		expect(warnSpy).toHaveBeenCalled();

		process.env.TRACK_SQS_QUEUE_URL = previousEnv;
	});

	afterEach(() => {
		if (mockState.originalSend) {
			const sqsClient = getSqsClient({ queueUrl: trackQueueUrl });
			sqsClient.send = mockState.originalSend as typeof sqsClient.send;
		}
		process.env.TRACK_SQS_QUEUE_URL = originalTrackQueueUrl;
	});
});

afterAll(() => {
	mock.restore();
});
