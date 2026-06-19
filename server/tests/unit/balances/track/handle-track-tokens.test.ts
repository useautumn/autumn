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
import { Hono } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { getSqsClient } from "@/queue/initSqs.js";

const mockState = {
	getTokenTrackParamsCalls: [] as Record<string, unknown>[],
	runTrackWithRolloutCalls: [] as Record<string, unknown>[],
	queueCommands: [] as Record<string, unknown>[],
	originalSend: null as null | SQSClient["send"],
	queuedForReplay: false,
};

const trackAsyncQueueUrl =
	"https://sqs.eu-west-1.amazonaws.com/123456789012/track-async-dev.fifo";

const trackBody = {
	customer_id: "cus_123",
	entity_id: "ent_123",
	feature_id: "ai_credits",
	value: 3.5,
};

const featureDeductions = [
	{
		feature: { id: "ai_credits" },
		deduction: 1,
		tokens: {
			usage: {
				modelName: "openai/gpt-4.1",
				inputTokens: 100,
				outputTokens: 50,
			},
			cost: 3.5,
		},
	},
];

mock.module("@/internal/balances/track/utils/getTokenTrackParams.js", () => ({
	getTokenTrackParams: async (args: Record<string, unknown>) => {
		mockState.getTokenTrackParamsCalls.push(args);
		const input = args.input as {
			async?: boolean;
			idempotency_key?: string;
			timestamp?: number;
		};
		return {
			body: {
				...trackBody,
				async: input.async,
				idempotency_key: input.idempotency_key,
				timestamp: input.timestamp,
			},
			featureDeductions,
		};
	},
}));

mock.module("@/internal/balances/track/runTrackWithRollout.js", () => ({
	runTrackWithRollout: async (args: {
		ctx: AutumnContext;
		body: typeof trackBody;
		featureDeductions: typeof featureDeductions;
	}) => {
		mockState.runTrackWithRolloutCalls.push(args);
		if (mockState.queuedForReplay) {
			args.ctx.extraLogs.trackQueuedForReplay = true;
		}
		return {
			customer_id: args.body.customer_id,
			entity_id: args.body.entity_id,
			value: args.body.value,
			balance: null,
		};
	},
}));

import { handleTrackTokens } from "@/internal/balances/handlers/handleTrackTokens.js";

const requestBody = {
	customer_id: "cus_123",
	entity_id: "ent_123",
	model_id: "openai/gpt-4.1",
	input_tokens: 100,
	output_tokens: 50,
};
const timestamp = Date.UTC(2024, 0, 15, 12, 30, 0);

const createApp = ({ ctx }: { ctx: AutumnContext }) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", ctx);
		await next();
	});
	app.post("/track_tokens", ...handleTrackTokens);
	return app;
};

const createCtx = (): AutumnContext =>
	({
		id: "req_track_tokens_1",
		org: { id: "org_123" },
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		features: [],
		extraLogs: {},
		scopes: [],
		skipCache: false,
		logger: {
			warn: mock(() => {}),
			error: mock(() => {}),
		},
	}) as unknown as AutumnContext;

describe("handleTrackTokens", () => {
	const originalEnv = process.env.TRACK_ASYNC_SQS_QUEUE_URL;

	afterAll(() => {
		mock.restore();
	});

	afterEach(() => {
		if (mockState.originalSend) {
			const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
			sqsClient.send = mockState.originalSend as typeof sqsClient.send;
			mockState.originalSend = null;
		}
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = originalEnv;
	});

	beforeEach(() => {
		mockState.getTokenTrackParamsCalls = [];
		mockState.runTrackWithRolloutCalls = [];
		mockState.queueCommands = [];
		mockState.queuedForReplay = false;
	});

	test("tracks converted token usage through the rollout path", async () => {
		const ctx = createCtx();
		const response = await createApp({ ctx }).request("/track_tokens", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ...requestBody, timestamp }),
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			customer_id: "cus_123",
			entity_id: "ent_123",
			value: 3.5,
			balance: null,
		});
		expect(mockState.getTokenTrackParamsCalls).toHaveLength(1);
		expect(mockState.getTokenTrackParamsCalls[0]).toMatchObject({
			input: { ...requestBody, timestamp },
		});
		expect(mockState.runTrackWithRolloutCalls).toHaveLength(1);
		expect(mockState.runTrackWithRolloutCalls[0]).toMatchObject({
			body: trackBody,
			featureDeductions,
		});
		expect(mockState.queueCommands).toHaveLength(0);
	});

	test("returns 204 and queues when async passthrough is true", async () => {
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = trackAsyncQueueUrl;
		const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
		mockState.originalSend = sqsClient.send.bind(sqsClient);
		sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
			mockState.queueCommands.push(command.input);
			return {};
		}) as typeof sqsClient.send;

		const ctx = createCtx();
		const response = await createApp({ ctx }).request("/track_tokens", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				...requestBody,
				async: true,
				idempotency_key: "async-track-token-event",
				timestamp,
			}),
		});

		expect(response.status).toBe(204);
		expect(await response.text()).toBe("");
		expect(mockState.getTokenTrackParamsCalls).toHaveLength(1);
		expect(mockState.getTokenTrackParamsCalls[0]).toMatchObject({
			input: {
				...requestBody,
				async: true,
				idempotency_key: "async-track-token-event",
				timestamp,
			},
		});

		expect(mockState.queueCommands).toHaveLength(1);
		expect(mockState.queueCommands[0]).toMatchObject({
			QueueUrl: trackAsyncQueueUrl,
			MessageGroupId: "org_123:sandbox:cus_123:ent_123",
			MessageDeduplicationId: "req_track_tokens_1",
		});
		expect(
			JSON.parse(mockState.queueCommands[0]?.MessageBody as string),
		).toMatchObject({
			name: "track",
			data: {
				customerId: "cus_123",
				entityId: "ent_123",
				body: {
					...trackBody,
					async: true,
					idempotency_key: "async-track-token-event",
					timestamp,
				},
			},
		});
		expect(mockState.runTrackWithRolloutCalls).toHaveLength(0);
	});

	test("returns 202 when rollout fallback queues token tracking for replay", async () => {
		mockState.queuedForReplay = true;
		const ctx = createCtx();
		const response = await createApp({ ctx }).request("/track_tokens", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(requestBody),
		});

		expect(response.status).toBe(202);
		expect(ctx.extraLogs.trackQueuedForReplay).toBe(true);
		expect(mockState.runTrackWithRolloutCalls).toHaveLength(1);
	});
});
