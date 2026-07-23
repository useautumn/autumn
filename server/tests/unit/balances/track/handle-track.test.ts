import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersionClass, AppEnv, LATEST_VERSION } from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";
import { Hono } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { getSqsClient } from "@/queue/initSqs.js";

const trackAsyncQueueUrl =
	"https://sqs.eu-west-1.amazonaws.com/123456789012/track-async-dev.fifo";

const mockState = {
	queueCommands: [] as Record<string, unknown>[],
	originalSend: null as null | SQSClient["send"],
};

import { handleTrack } from "@/internal/balances/handlers/handleTrack.js";

const createCtx = ({ orgSlug = "test-org" } = {}): AutumnContext =>
	({
		id: "req_track_1",
		org: { id: "org_123", slug: orgSlug },
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(LATEST_VERSION),
		features: [{ id: "messages" }],
		extraLogs: {},
		scopes: [],
		skipCache: false,
		logger: {
			warn: mock(() => {}),
			info: mock(() => {}),
			error: mock(() => {}),
			debug: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const createApp = ({ ctx }: { ctx: AutumnContext }) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", ctx);
		await next();
	});
	app.post("/track", ...handleTrack);
	return app;
};

describe("handleTrack", () => {
	const originalEnv = process.env.TRACK_ASYNC_SQS_QUEUE_URL;

	beforeEach(() => {
		mockState.queueCommands = [];
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = trackAsyncQueueUrl;
		const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
		mockState.originalSend = sqsClient.send.bind(sqsClient);
		sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
			mockState.queueCommands.push(command.input);
			return {};
		}) as typeof sqsClient.send;
	});

	afterEach(() => {
		if (mockState.originalSend) {
			const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
			sqsClient.send = mockState.originalSend as typeof sqsClient.send;
			mockState.originalSend = null;
		}
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = originalEnv;
	});

	test("returns 202 success for async track", async () => {
		const response = await createApp({ ctx: createCtx() }).request("/track", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				customer_id: "cus_123",
				feature_id: "messages",
				value: 1,
				async: true,
			}),
		});

		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({ success: true });
		expect(mockState.queueCommands).toHaveLength(1);
		expect(mockState.queueCommands[0]).toMatchObject({
			QueueUrl: trackAsyncQueueUrl,
			MessageDeduplicationId: "req_track_1",
		});
	});

	test("returns 202 success for Firecrawl track", async () => {
		const response = await createApp({
			ctx: createCtx({ orgSlug: "firecrawl" }),
		}).request("/track", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				customer_id: "cus_123",
				feature_id: "messages",
				value: 1,
			}),
		});

		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({ success: true });
		expect(mockState.queueCommands).toHaveLength(1);
	});
});
