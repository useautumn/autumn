import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { Hono } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";

const mockState = {
	batchTrackBodies: [] as unknown[],
	batchTrackTokenBodies: [] as unknown[],
};

mock.module("@/internal/balances/track/runBatchTrack.js", () => ({
	runBatchTrack: async ({ body }: { body: unknown }) => {
		mockState.batchTrackBodies.push(body);
	},
}));

mock.module("@/internal/balances/track/runBatchTrackTokens.js", () => ({
	runBatchTrackTokens: async ({ body }: { body: unknown }) => {
		mockState.batchTrackTokenBodies.push(body);
	},
}));

import { handleBatchTrack } from "@/internal/balances/handlers/handleBatchTrack.js";
import { handleBatchTrackTokens } from "@/internal/balances/handlers/handleBatchTrackTokens.js";

const createCtx = () =>
	({
		id: "req_batch_status",
		org: { id: "org_123" },
		env: AppEnv.Sandbox,
		logger: {},
	}) as AutumnContext;

const createApp = ({ ctx }: { ctx: AutumnContext }) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", ctx);
		await next();
	});
	app.post("/balances.batch_track", ...handleBatchTrack);
	app.post("/balances.batch_track_tokens", ...handleBatchTrackTokens);
	return app;
};

describe("batch track handlers", () => {
	beforeEach(() => {
		mockState.batchTrackBodies = [];
		mockState.batchTrackTokenBodies = [];
	});

	test("returns 200 success after enqueueing batch track", async () => {
		const body = [{ customer_id: "cus_123", feature_id: "messages" }];
		const response = await createApp({ ctx: createCtx() }).request(
			"/balances.batch_track",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			},
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(mockState.batchTrackBodies).toEqual([body]);
	});

	test("returns 200 success after enqueueing batch track tokens", async () => {
		const body = [
			{
				customer_id: "cus_123",
				model_id: "openai/gpt-4o",
				input_tokens: 100,
				output_tokens: 50,
			},
		];
		const response = await createApp({ ctx: createCtx() }).request(
			"/balances.batch_track_tokens",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			},
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(mockState.batchTrackTokenBodies).toEqual([body]);
	});
});
