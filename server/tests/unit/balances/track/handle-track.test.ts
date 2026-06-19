import { describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import { Hono } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";

const mockState = {
	runAsyncTrackCalls: [] as Record<string, unknown>[],
};

mock.module("@/internal/balances/track/runAsyncTrack.js", () => ({
	runAsyncTrack: async (args: Record<string, unknown>) => {
		mockState.runAsyncTrackCalls.push(args);
	},
}));

mock.module("@/internal/balances/track/runTrackWithRollout.js", () => ({
	runTrackWithRollout: async () => ({ value: 1 }),
}));

mock.module("@/internal/balances/track/utils/getFeatureDeductions.js", () => ({
	getTrackFeatureDeductionsForBody: () => [],
}));

import { handleTrack } from "@/internal/balances/handlers/handleTrack.js";

const createCtx = (): AutumnContext =>
	({
		id: "req_track_1",
		org: { id: "org_123" },
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		features: [],
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
	test("returns 202 success for async track", async () => {
		mockState.runAsyncTrackCalls = [];

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
		expect(mockState.runAsyncTrackCalls).toHaveLength(1);
	});
});
