import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv, ErrCode } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const mockState = {
	queueTrackCalls: [] as Record<string, unknown>[],
	queueTrackResult: null as unknown,
};

const trackAsyncQueueUrl =
	"https://sqs.eu-west-1.amazonaws.com/123456789012/track-async-dev.fifo";

mock.module("@/internal/balances/track/utils/queueTrack.js", () => ({
	queueTrack: async (args: Record<string, unknown>) => {
		mockState.queueTrackCalls.push(args);
		return mockState.queueTrackResult;
	},
}));

import { runAsyncTrack } from "@/internal/balances/track/runAsyncTrack.js";

const buildCtx = () =>
	({
		id: "req_async_1",
		org: { id: "org_123" },
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
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
		mockState.queueTrackCalls = [];
		mockState.queueTrackResult = {
			customer_id: "cus_123",
			value: 1,
			balance: null,
		};
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = trackAsyncQueueUrl;
	});

	afterEach(() => {
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = originalEnv;
	});

	test("calls queueTrack with TRACK_ASYNC_SQS_QUEUE_URL and resolves without throwing", async () => {
		const ctx = buildCtx();

		await runAsyncTrack({ ctx, body });

		expect(mockState.queueTrackCalls).toHaveLength(1);
		expect(mockState.queueTrackCalls[0]).toMatchObject({
			ctx,
			body,
			queueUrl: trackAsyncQueueUrl,
		});
	});

	test("throws 503 RecaseError when TRACK_ASYNC_SQS_QUEUE_URL is unset", async () => {
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = undefined;
		const ctx = buildCtx();

		await expect(runAsyncTrack({ ctx, body })).rejects.toMatchObject({
			code: ErrCode.InternalError,
			statusCode: 503,
			message: "Async track is not available right now",
		});

		expect(mockState.queueTrackCalls).toHaveLength(0);
		expect(ctx.logger.error).toHaveBeenCalled();
	});

	test("throws 503 RecaseError when queueTrack returns null", async () => {
		mockState.queueTrackResult = null;
		const ctx = buildCtx();

		await expect(runAsyncTrack({ ctx, body })).rejects.toMatchObject({
			code: ErrCode.InternalError,
			statusCode: 503,
			message: "Async track is not available right now",
		});

		expect(mockState.queueTrackCalls).toHaveLength(1);
	});
});
