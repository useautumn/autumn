import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv, ErrCode } from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getSqsClient } from "@/queue/initSqs.js";

const mockState = {
	queueCommands: [] as Record<string, unknown>[],
	queueFailureIndex: null as number | null,
	originalSend: null as null | SQSClient["send"],
};

const trackAsyncQueueUrl =
	"https://sqs.eu-west-1.amazonaws.com/123456789012/track-async-dev.fifo";

import { runAsyncTrack } from "@/internal/balances/track/runAsyncTrack.js";

const buildCtx = ({ requestId = "req_async_1" }: { requestId?: string } = {}) =>
	({
		id: requestId,
		org: { id: "org_123" },
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		extraLogs: {},
		logger: {
			warn: mock(() => {}),
			error: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const body = {
	customer_id: "cus_123",
	feature_id: "messages",
	value: 1,
	async: true,
};

describe("runAsyncTrack", () => {
	const originalEnv = process.env.TRACK_ASYNC_SQS_QUEUE_URL;

	beforeEach(() => {
		mockState.queueCommands = [];
		mockState.queueFailureIndex = null;
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = trackAsyncQueueUrl;

		const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
		mockState.originalSend = sqsClient.send.bind(sqsClient);
		sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
			const callIndex = mockState.queueCommands.length;
			mockState.queueCommands.push(command.input);

			if (mockState.queueFailureIndex === callIndex) {
				throw new Error("SQS unavailable");
			}

			const entries =
				(command.input.Entries as Array<{ Id?: string }> | undefined) ?? [];
			return {
				Successful: entries.map((entry) => ({ Id: entry.Id })),
			};
		}) as typeof sqsClient.send;
	});

	afterEach(() => {
		if (mockState.originalSend) {
			const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
			sqsClient.send = mockState.originalSend as typeof sqsClient.send;
		}
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = originalEnv;
	});

	test("queues track with TRACK_ASYNC_SQS_QUEUE_URL and resolves without throwing", async () => {
		const ctx = buildCtx();

		await runAsyncTrack({ ctx, body });

		expect(mockState.queueCommands).toHaveLength(1);
		expect(ctx.logger.warn).not.toHaveBeenCalled();
		expect(ctx.extraLogs.trackQueuedForReplay).toBeUndefined();
		expect(mockState.queueCommands[0]).toMatchObject({
			QueueUrl: trackAsyncQueueUrl,
		});
		const entries = mockState.queueCommands[0]?.Entries as Array<
			Record<string, unknown>
		>;
		expect(entries).toHaveLength(1);
		expect(entries[0]?.MessageDeduplicationId).toBe("req_async_1");
		expect(entries[0]?.MessageGroupId).toMatch(
			/^org_123:sandbox:cus_123:none:shard-[0-7]$/,
		);
		expect(JSON.parse(entries[0]?.MessageBody as string)).toMatchObject({
			name: "track",
			data: {
				customerId: "cus_123",
				body,
			},
		});
	});

	test("uses a deterministic shard derived from the message deduplication ID", async () => {
		const firstCtx = buildCtx();
		const secondCtx = buildCtx();

		await runAsyncTrack({ ctx: firstCtx, body });
		await runAsyncTrack({ ctx: secondCtx, body });

		expect(mockState.queueCommands).toHaveLength(2);
		const firstEntries = mockState.queueCommands[0]?.Entries as Array<
			Record<string, unknown>
		>;
		const secondEntries = mockState.queueCommands[1]?.Entries as Array<
			Record<string, unknown>
		>;
		expect(firstEntries[0]?.MessageGroupId).toBe(
			secondEntries[0]?.MessageGroupId,
		);
	});

	test("shares one SQS batch call across 10 concurrent async tracks", async () => {
		await Promise.all(
			Array.from({ length: 10 }, (_, index) =>
				runAsyncTrack({
					ctx: buildCtx({ requestId: `req_async_${index}` }),
					body: {
						...body,
						customer_id: `cus_${index}`,
					},
				}),
			),
		);

		expect(mockState.queueCommands).toHaveLength(1);
		const entries = mockState.queueCommands[0]?.Entries as Array<
			Record<string, unknown>
		>;
		expect(entries).toHaveLength(10);
		expect(entries.map((entry) => entry.MessageDeduplicationId)).toEqual(
			Array.from({ length: 10 }, (_, index) => `req_async_${index}`),
		);
	});

	test("throws 503 RecaseError when TRACK_ASYNC_SQS_QUEUE_URL is unset", async () => {
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = undefined;
		const ctx = buildCtx();

		await expect(runAsyncTrack({ ctx, body })).rejects.toMatchObject({
			code: ErrCode.InternalError,
			statusCode: 503,
			message: "Async track is not available right now",
		});

		expect(mockState.queueCommands).toHaveLength(0);
		expect(ctx.logger.error).toHaveBeenCalled();
	});

	test("throws 503 RecaseError when the batched SQS send fails", async () => {
		mockState.queueFailureIndex = 0;
		const ctx = buildCtx();

		await expect(runAsyncTrack({ ctx, body })).rejects.toMatchObject({
			code: ErrCode.InternalError,
			statusCode: 503,
			message: "Async track is not available right now",
		});

		expect(mockState.queueCommands).toHaveLength(1);
	});
});
