import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, ErrCode } from "@autumn/shared";
import { Hono } from "hono";
import { errorMiddleware } from "@/honoMiddlewares/errorMiddleware.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

const mockState = {
	config: { enabled: false, batchSize: 500 },
	status: {
		healthy: true,
		configured: true,
		lastSuccessAt: "2026-07-23T10:00:00.000Z",
		error: null as string | null,
	},
	updateCalls: [] as unknown[],
};

mock.module("@/internal/misc/resetJob/resetJobStore.js", () => ({
	getResetJobConfigFromSource: async () => mockState.config,
	getResetJobConfigStatus: () => mockState.status,
	updateResetJobConfig: async ({ config }: { config: unknown }) => {
		mockState.updateCalls.push(config);
	},
}));

import { handleGetAdminResetJobConfig } from "@/internal/admin/handleGetAdminResetJobConfig.js";
import { handleUpsertAdminResetJobConfig } from "@/internal/admin/handleUpsertAdminResetJobConfig.js";

const buildApp = () => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", {
			env: AppEnv.Sandbox,
			org: { slug: "tests-org" },
			logger: { warn: () => undefined, error: () => undefined },
		} as unknown as HonoEnv["Variables"]["ctx"]);
		await next();
	});
	app.get("/admin/reset-job-config", ...handleGetAdminResetJobConfig);
	app.put("/admin/reset-job-config", ...handleUpsertAdminResetJobConfig);
	app.onError(errorMiddleware);
	return app;
};

describe("admin reset job config", () => {
	beforeEach(() => {
		mockState.config = { enabled: false, batchSize: 500 };
		mockState.status = {
			healthy: true,
			configured: true,
			lastSuccessAt: "2026-07-23T10:00:00.000Z",
			error: null,
		};
		mockState.updateCalls = [];
	});

	test("GET returns config and source status", async () => {
		const response = await buildApp().request(
			"http://localhost/admin/reset-job-config",
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			enabled: false,
			batchSize: 500,
			configHealthy: true,
			configConfigured: true,
			lastSuccessAt: "2026-07-23T10:00:00.000Z",
			error: null,
		});
	});

	test("PUT saves the config", async () => {
		const response = await buildApp().request(
			"http://localhost/admin/reset-job-config",
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ enabled: true, batchSize: 1_000 }),
			},
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(mockState.updateCalls).toEqual([
			{ enabled: true, batchSize: 1_000 },
		]);
	});

	test("PUT defaults missing values", async () => {
		const response = await buildApp().request(
			"http://localhost/admin/reset-job-config",
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			},
		);

		expect(response.status).toBe(200);
		expect(mockState.updateCalls).toEqual([{ enabled: false, batchSize: 500 }]);
	});

	test("PUT rejects non-boolean values", async () => {
		const response = await buildApp().request(
			"http://localhost/admin/reset-job-config",
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ enabled: "yes" }),
			},
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.code).toBe(ErrCode.InvalidInputs);
		expect(mockState.updateCalls).toHaveLength(0);
	});

	test("PUT rejects an unsafe batch size", async () => {
		const response = await buildApp().request(
			"http://localhost/admin/reset-job-config",
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ enabled: true, batchSize: 2_001 }),
			},
		);

		expect(response.status).toBe(400);
		expect(mockState.updateCalls).toHaveLength(0);
	});
});
