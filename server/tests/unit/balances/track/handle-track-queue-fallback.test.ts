import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const mockState = {
	shouldUseRedis: true,
	queueCalls: [] as Record<string, unknown>[],
	runTrackCalls: [] as Record<string, unknown>[],
	warnCalls: [] as unknown[][],
};

mock.module("@/external/redis/initRedis.js", () => ({
	shouldUseRedis: () => mockState.shouldUseRedis,
}));

mock.module("@/queue/queueUtils.js", () => ({
	addTaskToQueue: async (args: Record<string, unknown>) => {
		mockState.queueCalls.push(args);
	},
}));

mock.module("@/internal/balances/track/runTrackWithRollout.js", () => ({
	runTrackWithRollout: async (args: Record<string, unknown>) => {
		mockState.runTrackCalls.push(args);
		return { ok: true };
	},
}));

import { handleTrack } from "@/internal/balances/handlers/handleTrack.js";
import { JobName } from "@/queue/JobName.js";

const wrappedHandler = handleTrack[handleTrack.length - 1] as unknown as (
	c: ReturnType<typeof makeContext>,
) => Promise<Response>;

const makeCtx = ({ apiVersion }: { apiVersion: ApiVersion }) =>
	({
		org: {
			id: "org_123",
		},
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(apiVersion),
		logger: {
			warn: (...args: unknown[]) => {
				mockState.warnCalls.push(args);
			},
		},
		features: [
			{
				id: "messages",
				event_names: [],
			},
		],
	}) as unknown as AutumnContext;

const makeContext = ({
	body,
	apiVersion,
}: {
	body: Record<string, unknown>;
	apiVersion: ApiVersion;
}) => {
	const store = new Map<string, unknown>([["ctx", makeCtx({ apiVersion })]]);

	return {
		req: {
			valid: (target: string) => {
				if (target === "json") return body;
				return {};
			},
		},
		get: (key: string) => store.get(key),
		set: (key: string, value: unknown) => {
			store.set(key, value);
		},
		json: (data: unknown, status = 200) =>
			new Response(JSON.stringify(data), {
				status,
				headers: {
					"content-type": "application/json",
				},
			}),
	};
};

describe("handleTrack queue fallback", () => {
	const originalTrackQueueUrl = process.env.TRACK_SQS_QUEUE_URL;

	beforeEach(() => {
		mockState.shouldUseRedis = false;
		mockState.queueCalls = [];
		mockState.runTrackCalls = [];
		mockState.warnCalls = [];
	});

	afterEach(() => {
		process.env.TRACK_SQS_QUEUE_URL = originalTrackQueueUrl;
	});

	test("queues track and returns the legacy success shape when Redis is unavailable", async () => {
		process.env.TRACK_SQS_QUEUE_URL =
			"https://sqs.eu-west-1.amazonaws.com/123456789012/track-dev.fifo";

		const response = await wrappedHandler(
			makeContext({
				apiVersion: ApiVersion.V1_Beta,
				body: {
					customer_id: "cus_123",
					feature_id: "messages",
					value: 2,
					idempotency_key: "idem_123",
				},
			}),
		);

		expect(mockState.queueCalls).toHaveLength(1);
		expect(mockState.runTrackCalls).toHaveLength(0);
		expect(mockState.warnCalls).toContainEqual([
			"[track] Redis unavailable, queued track fallback",
			expect.objectContaining({
				type: "track_queue_fallback",
				customer_id: "cus_123",
				feature_id: "messages",
				queue_name: "track-dev.fifo",
			}),
		]);
		expect(mockState.queueCalls[0]).toMatchObject({
			jobName: JobName.Track,
			queueUrl:
				"https://sqs.eu-west-1.amazonaws.com/123456789012/track-dev.fifo",
			messageGroupId: "org_123:sandbox:cus_123",
			messageDeduplicationId: "idem_123",
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			id: "placeholder",
			code: "event_received",
			customer_id: "cus_123",
			feature_id: "messages",
		});
	});

	test("falls back to synchronous track when Redis is unavailable and TRACK_SQS_QUEUE_URL is unset", async () => {
		delete process.env.TRACK_SQS_QUEUE_URL;

		const response = await wrappedHandler(
			makeContext({
				apiVersion: ApiVersion.V2_1,
				body: {
					customer_id: "cus_123",
					feature_id: "messages",
				},
			}),
		);

		expect(mockState.queueCalls).toHaveLength(0);
		expect(mockState.runTrackCalls).toHaveLength(1);
		expect(response.status).toBe(200);
	});
});
