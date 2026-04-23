import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const mockState = {
	shouldUseRedis: true,
	queueCalls: [] as Record<string, unknown>[],
	runTrackCalls: [] as Record<string, unknown>[],
};

mock.module("@/external/redis/initRedis.js", () => ({
	redis: {},
	shouldUseRedis: () => mockState.shouldUseRedis,
}));

mock.module("@/external/redis/initRedis", () => ({
	redis: {},
	shouldUseRedis: () => mockState.shouldUseRedis,
}));

mock.module("@/internal/balances/track/utils/queueTrack.js", () => ({
	queueTrack: async (args: Record<string, unknown>) => {
		mockState.queueCalls.push(args);
		if (!process.env.TRACK_SQS_QUEUE_URL) return null;

		const body = args.body as { customer_id: string; feature_id: string };
		return {
			id: "placeholder",
			code: "event_received",
			customer_id: body.customer_id,
			feature_id: body.feature_id,
		};
	},
}));

mock.module("@/internal/balances/track/runTrackWithRollout.js", () => ({
	runTrackWithRollout: async (args: Record<string, unknown>) => {
		mockState.runTrackCalls.push(args);
		return { ok: true };
	},
}));

import { handleTrack } from "@/internal/balances/handlers/handleTrack.js";

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
			warn: () => undefined,
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
	});

	afterEach(() => {
		if (originalTrackQueueUrl) {
			process.env.TRACK_SQS_QUEUE_URL = originalTrackQueueUrl;
		} else {
			delete process.env.TRACK_SQS_QUEUE_URL;
		}
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
		expect(mockState.queueCalls[0]).toMatchObject({
			body: {
				customer_id: "cus_123",
				feature_id: "messages",
			},
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

		expect(mockState.queueCalls).toHaveLength(1);
		expect(mockState.runTrackCalls).toHaveLength(1);
		expect(response.status).toBe(200);
	});
});
