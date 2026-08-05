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

await mockModuleWithRestore(
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

import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

describe("queueTrack", () => {
	const originalTrackQueueUrl = process.env.TRACK_SQS_QUEUE_URL;
	const originalAsyncQueueUrl = process.env.TRACK_ASYNC_SQS_QUEUE_URL;

	beforeEach(() => {
		mockState.queueCommands = [];
		// The async URL is the canonical shared track queue; the deprecated
		// TRACK_SQS_QUEUE_URL is unset so resolution is deterministic.
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = trackQueueUrl;
		delete process.env.TRACK_SQS_QUEUE_URL;
		const sqsClient = getSqsClient({ queueUrl: trackQueueUrl });
		mockState.originalSend = sqsClient.send.bind(sqsClient);
		sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
			mockState.queueCommands.push(command.input);
			const entries =
				(command.input.Entries as Array<{ Id?: string }> | undefined) ?? [];
			return {
				Successful: entries.map((entry) => ({ Id: entry.Id })),
			};
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
		});
		// Default resolution hits the shared async-track queue, which sends
		// through the batcher (SendMessageBatch envelope).
		const entries = mockState.queueCommands[0]?.Entries as Array<
			Record<string, unknown>
		>;
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			MessageGroupId: "org_123:sandbox:cus_123:ent_123",
			MessageDeduplicationId: "req_123",
		});
		expect(JSON.parse(entries[0]?.MessageBody as string)).toMatchObject({
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

	test("routes to explicit options.queueUrl when passed, ignoring env vars", async () => {
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
			options: {
				queueUrl: trackAsyncQueueUrl,
				messageDeduplicationId: "req_async_1-0",
			},
		});

		expect(mockState.queueCommands).toHaveLength(1);
		expect(mockState.queueCommands[0]).toMatchObject({
			QueueUrl: trackAsyncQueueUrl,
			MessageDeduplicationId: "req_async_1-0",
		});

		sqsClient.send = originalAsyncSend;
	});

	test("falls back to the deprecated TRACK_SQS_QUEUE_URL when the async URL is unset", async () => {
		delete process.env.TRACK_ASYNC_SQS_QUEUE_URL;
		process.env.TRACK_SQS_QUEUE_URL = trackQueueUrl;

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

	test("returns null when no queueUrl option and both env vars are unset", async () => {
		delete process.env.TRACK_ASYNC_SQS_QUEUE_URL;
		delete process.env.TRACK_SQS_QUEUE_URL;

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
	});

	afterEach(() => {
		if (mockState.originalSend) {
			const sqsClient = getSqsClient({ queueUrl: trackQueueUrl });
			sqsClient.send = mockState.originalSend as typeof sqsClient.send;
		}
		if (originalTrackQueueUrl === undefined) {
			delete process.env.TRACK_SQS_QUEUE_URL;
		} else {
			process.env.TRACK_SQS_QUEUE_URL = originalTrackQueueUrl;
		}
		if (originalAsyncQueueUrl === undefined) {
			delete process.env.TRACK_ASYNC_SQS_QUEUE_URL;
		} else {
			process.env.TRACK_ASYNC_SQS_QUEUE_URL = originalAsyncQueueUrl;
		}
	});
});

afterAll(() => {
	mock.restore();
});
