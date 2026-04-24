import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
} from "@autumn/shared";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getSqsClient } from "@/queue/initSqs.js";

const mockState = {
	queueCommands: [] as Record<string, unknown>[],
	queueError: null as Error | null,
	originalSend: null as ReturnType<typeof getSqsClient>["send"] | null,
	runTrackV2Calls: [] as Record<string, unknown>[],
	runTrackV3Calls: [] as Record<string, unknown>[],
	v3Error: null as unknown,
};

mock.module("@/internal/balances/track/runTrackV2.js", () => ({
	runTrackV2: async (args: Record<string, unknown>) => {
		mockState.runTrackV2Calls.push(args);
		return { ok: true };
	},
}));

mock.module("@/internal/balances/track/v3/runTrackV3.js", () => ({
	runTrackV3: async (args: Record<string, unknown>) => {
		mockState.runTrackV3Calls.push(args);
		if (mockState.v3Error) throw mockState.v3Error;
		return { ok: true };
	},
}));

mock.module("@/external/redis/initUtils/redisV2Availability.js", () => ({
	shouldUseRedisV2: () => true,
}));

import { runTrackWithRollout } from "@/internal/balances/track/runTrackWithRollout.js";

const ctx = {
	org: { id: "org_123" },
	env: AppEnv.Sandbox,
	apiVersion: new ApiVersionClass(ApiVersion.V2_1),
	logger: {
		warn: () => undefined,
	},
	rolloutSnapshot: {
		rolloutId: "v2-cache",
		enabled: true,
		percent: 100,
		previousPercent: 0,
		changedAt: 1,
		customerBucket: 10,
	},
} as unknown as AutumnContext;

const body = {
	customer_id: "cus_123",
	feature_id: "messages",
	value: 2,
	idempotency_key: "idem_123",
};

describe("track queue fallback", () => {
	beforeEach(() => {
		mockState.queueCommands = [];
		mockState.queueError = null;
		mockState.runTrackV2Calls = [];
		mockState.runTrackV3Calls = [];
		mockState.v3Error = null;
		process.env.TRACK_SQS_QUEUE_URL =
			"https://sqs.eu-west-1.amazonaws.com/123456789012/track-dev.fifo";

		const sqsClient = getSqsClient();
		mockState.originalSend = sqsClient.send.bind(sqsClient);
		sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
			if (mockState.queueError) {
				throw mockState.queueError;
			}

			mockState.queueCommands.push(command.input);
			return {};
		}) as typeof sqsClient.send;
	});

	test("queues track when rollout path hits a retryable Redis failure", async () => {
		mockState.v3Error = new RedisUnavailableError({
			source: "runTrackV3",
			reason: "not_ready",
		});

		const response = await runTrackWithRollout({
			ctx,
			body,
			featureDeductions: [],
		});

		expect(mockState.runTrackV3Calls).toHaveLength(1);
		expect(mockState.runTrackV2Calls).toHaveLength(0);
		expect(mockState.queueCommands).toHaveLength(1);
		expect(mockState.queueCommands[0]).toMatchObject({
			QueueUrl:
				"https://sqs.eu-west-1.amazonaws.com/123456789012/track-dev.fifo",
		});
		expect(response).toEqual({
			customer_id: "cus_123",
			entity_id: undefined,
			value: 2,
			balance: null,
		});
	});

	test("throws retryable Redis failure when queue fallback is unavailable", async () => {
		const error = new RedisUnavailableError({
			source: "runTrackV3",
			reason: "timeout",
		});
		mockState.v3Error = error;
		mockState.queueError = new Error("sqs unavailable");

		await expect(
			runTrackWithRollout({
				ctx,
				body,
				featureDeductions: [],
			}),
		).rejects.toBe(error);

		expect(mockState.queueCommands).toHaveLength(0);
	});

	afterEach(() => {
		const sqsClient = getSqsClient();
		if (mockState.originalSend) {
			sqsClient.send = mockState.originalSend;
		}
	});
});
