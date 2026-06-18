import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";

const mockState = {
	getTokenTrackParamsCalls: [] as Record<string, unknown>[],
	runTrackWithRolloutCalls: [] as Record<string, unknown>[],
	queuedForReplay: false,
};

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
		const input = args.input as { timestamp?: number };
		return {
			body: { ...trackBody, timestamp: input.timestamp },
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
		features: [],
		extraLogs: {},
		scopes: [],
		skipCache: false,
	}) as unknown as AutumnContext;

describe("handleTrackTokens", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		mockState.getTokenTrackParamsCalls = [];
		mockState.runTrackWithRolloutCalls = [];
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
