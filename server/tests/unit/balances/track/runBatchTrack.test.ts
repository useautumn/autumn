import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	type BatchTrackParams,
	BatchTrackParamsSchema,
	ErrCode,
} from "@autumn/shared";
import type { SendMessageBatchCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getSqsClient } from "@/queue/initSqs.js";

type BatchEntry = {
	Id?: string;
	MessageBody?: string;
	MessageGroupId?: string;
	MessageDeduplicationId?: string;
};

type BatchCommandInput = {
	QueueUrl?: string;
	Entries?: BatchEntry[];
};

const mockState = {
	queueCommands: [] as BatchCommandInput[],
	queueFailure: null as null | {
		batchIndex: number;
		entryId: string;
		message?: string;
	},
	originalSend: null as null | SQSClient["send"],
};

const trackAsyncQueueUrl =
	"https://sqs.eu-west-1.amazonaws.com/123456789012/track-async-dev.fifo";

import { runBatchTrack } from "@/internal/balances/track/runBatchTrack.js";

const buildCtx = () =>
	({
		id: "req_batch_1",
		org: { id: "org_123" },
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		features: [
			{
				id: "messages",
				event_names: ["message.sent"],
			},
			{
				id: "credits",
			},
		],
		extraLogs: {},
		logger: {
			warn: mock(() => {}),
			error: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const body = [
	{
		customer_id: "cus_123",
		feature_id: "messages",
		value: 1,
		async: false,
	},
	{
		customer_id: "cus_123",
		entity_id: "ent_123",
		event_name: "message.sent",
		value: 2,
		async: true,
	},
	{
		customer_id: "cus_456",
		feature_id: "credits",
		value: 3,
	},
];

describe("runBatchTrack", () => {
	const originalEnv = process.env.TRACK_ASYNC_SQS_QUEUE_URL;

	beforeEach(() => {
		mockState.queueCommands = [];
		mockState.queueFailure = null;
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = trackAsyncQueueUrl;

		const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
		mockState.originalSend = sqsClient.send.bind(sqsClient);
		sqsClient.send = (async (command: SendMessageBatchCommand) => {
			const batchIndex = mockState.queueCommands.length;
			const input = command.input as BatchCommandInput;
			const entries = input.Entries ?? [];
			mockState.queueCommands.push(input);
			const successful = entries.map((entry) => ({ Id: entry.Id }));
			const failure = mockState.queueFailure;

			if (failure?.batchIndex === batchIndex) {
				return {
					Successful: successful.filter(
						(entry) => entry.Id !== failure.entryId,
					),
					Failed: [
						{
							Id: failure.entryId,
							Code: "InternalError",
							Message: failure.message ?? "SQS unavailable",
							SenderFault: false,
						},
					],
				};
			}

			return { Successful: successful };
		}) as typeof sqsClient.send;
	});

	afterEach(() => {
		if (mockState.originalSend) {
			const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
			sqsClient.send = mockState.originalSend as typeof sqsClient.send;
		}
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = originalEnv;
	});

	test("validates all items before enqueueing one batch with per-item deduplication", async () => {
		const ctx = buildCtx();

		await runBatchTrack({ ctx, body });

		expect(mockState.queueCommands).toHaveLength(1);
		expect(mockState.queueCommands[0]).toMatchObject({
			QueueUrl: trackAsyncQueueUrl,
		});
		expect(mockState.queueCommands[0]?.Entries).toHaveLength(3);
		expect(mockState.queueCommands[0]?.Entries?.[0]).toMatchObject({
			Id: "0",
			MessageDeduplicationId: "req_batch_1-0",
		});
		expect(mockState.queueCommands[0]?.Entries?.[0]?.MessageGroupId).toMatch(
			/^org_123:sandbox:cus_123:none:shard-[0-7]$/,
		);
		expect(mockState.queueCommands[0]?.Entries?.[1]).toMatchObject({
			Id: "1",
			MessageDeduplicationId: "req_batch_1-1",
		});
		expect(mockState.queueCommands[0]?.Entries?.[1]?.MessageGroupId).toMatch(
			/^org_123:sandbox:cus_123:ent_123:shard-[0-7]$/,
		);
		expect(mockState.queueCommands[0]?.Entries?.[2]).toMatchObject({
			Id: "2",
			MessageDeduplicationId: "req_batch_1-2",
		});
		expect(mockState.queueCommands[0]?.Entries?.[2]?.MessageGroupId).toMatch(
			/^org_123:sandbox:cus_456:none:shard-[0-7]$/,
		);
		expect(
			JSON.parse(mockState.queueCommands[0]?.Entries?.[1]?.MessageBody ?? "{}"),
		).toMatchObject({
			name: "track",
			data: {
				customerId: "cus_123",
				entityId: "ent_123",
				body: body[1],
			},
		});
	});

	test("preserves per-item idempotency keys in queued jobs without relying on SQS deduplication", async () => {
		const ctx = buildCtx();
		const bodyWithIdempotency: BatchTrackParams = [
			{
				customer_id: "cus_123",
				feature_id: "messages",
				value: 1,
				idempotency_key: "batch-item-1",
			},
			{
				customer_id: "cus_456",
				feature_id: "credits",
				value: 2,
			},
		];

		await runBatchTrack({ ctx, body: bodyWithIdempotency });

		expect(mockState.queueCommands[0]?.Entries?.[0]).toMatchObject({
			MessageDeduplicationId: "req_batch_1-0",
		});
		expect(mockState.queueCommands[0]?.Entries?.[1]).toMatchObject({
			MessageDeduplicationId: "req_batch_1-1",
		});
		expect(
			JSON.parse(mockState.queueCommands[0]?.Entries?.[0]?.MessageBody ?? "{}"),
		).toMatchObject({
			data: {
				body: {
					idempotency_key: "batch-item-1",
				},
			},
		});
	});

	test("throws 503 RecaseError when TRACK_ASYNC_SQS_QUEUE_URL is unset", async () => {
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = undefined;
		const ctx = buildCtx();

		await expect(runBatchTrack({ ctx, body })).rejects.toMatchObject({
			code: ErrCode.InternalError,
			statusCode: 503,
			message: "Async track is not available right now",
		});

		expect(mockState.queueCommands).toHaveLength(0);
		expect(ctx.logger.error).toHaveBeenCalled();
	});

	test("returns success on partial failure: logs the failed indices but does not throw (avoids client retry of an already-partially-enqueued batch)", async () => {
		mockState.queueFailure = { batchIndex: 0, entryId: "1" };
		const ctx = buildCtx();

		await expect(runBatchTrack({ ctx, body })).resolves.toBeUndefined();

		expect(mockState.queueCommands).toHaveLength(1);
		expect(ctx.logger.error).toHaveBeenCalledWith(
			"[track] batch track enqueue had partial failures",
			expect.objectContaining({
				failure_count: 1,
				failures: [{ index: 1, reason: "SQS unavailable" }],
				success_count: 2,
				total_count: 3,
			}),
		);
	});

	test("throws 503 RecaseError only when ALL batch entries fail (no client-visible silent loss; safe to retry whole request)", async () => {
		const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
		sqsClient.send = (async (command: SendMessageBatchCommand) => {
			const input = command.input as BatchCommandInput;
			const entries = input.Entries ?? [];
			mockState.queueCommands.push(input);
			return {
				Failed: entries.map((entry) => ({
					Id: entry.Id,
					Code: "InternalError",
					Message: "SQS unavailable",
					SenderFault: false,
				})),
			};
		}) as typeof sqsClient.send;
		const ctx = buildCtx();

		await expect(runBatchTrack({ ctx, body })).rejects.toMatchObject({
			code: ErrCode.InternalError,
			statusCode: 503,
			message: "Async track is not available right now",
		});

		expect(ctx.logger.error).toHaveBeenCalled();
	});

	test("chunk-level send error becomes per-entry failures, not a thrown rejection (earlier chunks already in SQS must not trigger a retry)", async () => {
		const ctx = buildCtx();
		const largeBody: BatchTrackParams = Array.from({ length: 20 }, (_, i) => ({
			customer_id: `cus_${i}`,
			feature_id: "messages",
			value: 1,
		}));

		const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
		let chunkCounter = 0;
		sqsClient.send = (async (command: SendMessageBatchCommand) => {
			const thisChunk = chunkCounter;
			chunkCounter += 1;
			const input = command.input as BatchCommandInput;
			const entries = input.Entries ?? [];
			mockState.queueCommands.push(input);
			if (thisChunk === 1) {
				throw new Error("network reset on chunk 2");
			}
			return {
				Successful: entries.map((entry) => ({ Id: entry.Id })),
			};
		}) as typeof sqsClient.send;

		await expect(
			runBatchTrack({ ctx, body: largeBody }),
		).resolves.toBeUndefined();

		expect(mockState.queueCommands).toHaveLength(2);
		expect(ctx.logger.error).toHaveBeenCalledWith(
			"[track] batch track enqueue had partial failures",
			expect.objectContaining({
				failure_count: 10,
				success_count: 10,
				total_count: 20,
			}),
		);
	});

	test("chunks 1000 items into 100 SQS batch calls", async () => {
		const ctx = buildCtx();
		const largeBody: BatchTrackParams = Array.from(
			{ length: 1000 },
			(_, index) => ({
				customer_id: `cus_${index}`,
				feature_id: "messages",
				value: index + 1,
			}),
		);

		await runBatchTrack({ ctx, body: largeBody });

		expect(mockState.queueCommands).toHaveLength(100);

		for (const command of mockState.queueCommands) {
			expect(command.Entries).toHaveLength(10);
		}
		const shardIds = new Set(
			mockState.queueCommands
				.flatMap((command) => command.Entries ?? [])
				.map((entry) => entry.MessageGroupId?.split(":").pop()),
		);
		expect(shardIds).toEqual(
			new Set(Array.from({ length: 8 }, (_, index) => `shard-${index}`)),
		);

		expect(mockState.queueCommands[0]?.Entries?.[0]).toMatchObject({
			Id: "0",
			MessageDeduplicationId: "req_batch_1-0",
		});
		expect(mockState.queueCommands[0]?.Entries?.[0]?.MessageGroupId).toMatch(
			/^org_123:sandbox:cus_0:none:shard-[0-7]$/,
		);
		expect(mockState.queueCommands[99]?.Entries?.[9]).toMatchObject({
			Id: "9",
			MessageDeduplicationId: "req_batch_1-999",
		});
		expect(mockState.queueCommands[99]?.Entries?.[9]?.MessageGroupId).toMatch(
			/^org_123:sandbox:cus_999:none:shard-[0-7]$/,
		);
	});

	test("rejects empty batch body at schema parse time", () => {
		expect(() => BatchTrackParamsSchema.parse([])).toThrow();
	});
});
