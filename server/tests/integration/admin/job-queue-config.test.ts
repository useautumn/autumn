import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, ErrCode } from "@autumn/shared";
import { Hono } from "hono";
import { errorMiddleware } from "@/honoMiddlewares/errorMiddleware.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

type MockJobQueueConfig = {
	queues: Record<string, { enabled: boolean }>;
};

type MockStatus = {
	healthy: boolean;
	configured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

const mockState = {
	config: {
		queues: {
			primary: { enabled: true },
			track: { enabled: false },
		},
	} as MockJobQueueConfig,
	status: {
		healthy: true,
		configured: true,
		lastSuccessAt: "2026-04-24T10:00:00.000Z",
		error: null,
	} as MockStatus,
	updateCalls: [] as unknown[],
};

mock.module("@/internal/misc/jobQueues/jobQueueStore.js", () => ({
	KNOWN_JOB_QUEUES: [
		{
			id: "primary",
			label: "Primary Queue",
			description: "Shared SQS queue for standard background jobs.",
			defaultEnabled: true,
		},
		{
			id: "track",
			label: "Track Replay Queue",
			description:
				"Dedicated async track replay queue used during fail-open recovery.",
			defaultEnabled: true,
		},
	],
	getJobQueueConfigFromSource: async () => mockState.config,
	getJobQueueConfigStatus: () => mockState.status,
	updateFullJobQueueConfig: async ({ config }: { config: unknown }) => {
		mockState.updateCalls.push(config);
	},
}));

import { handleGetAdminJobQueueConfig } from "@/internal/admin/handleGetAdminJobQueueConfig.js";
import { handleUpsertAdminJobQueueConfig } from "@/internal/admin/handleUpsertAdminJobQueueConfig.js";

const buildApp = () => {
	const app = new Hono<HonoEnv>();

	app.use("*", async (c, next) => {
		c.set("ctx", {
			env: AppEnv.Sandbox,
			org: { slug: "tests-org" },
			logger: {
				warn: () => undefined,
				error: () => undefined,
			},
		} as any);
		await next();
	});

	app.get("/admin/job-queue-config", ...handleGetAdminJobQueueConfig);
	app.put("/admin/job-queue-config", ...handleUpsertAdminJobQueueConfig);
	app.onError(errorMiddleware);

	return app;
};

describe("admin job queue config", () => {
	beforeEach(() => {
		mockState.config = {
			queues: {
				primary: { enabled: true },
				track: { enabled: false },
			},
		};
		mockState.status = {
			healthy: true,
			configured: true,
			lastSuccessAt: "2026-04-24T10:00:00.000Z",
			error: null,
		};
		mockState.updateCalls = [];
	});

	test("GET returns the stored config, status, and known queues", async () => {
		const app = buildApp();

		const response = await app.request("http://localhost/admin/job-queue-config");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			queues: {
				primary: { enabled: true },
				track: { enabled: false },
			},
			configHealthy: true,
			configConfigured: true,
			lastSuccessAt: "2026-04-24T10:00:00.000Z",
			error: null,
		});
		expect(body.knownQueues).toEqual([
			{
				id: "primary",
				label: "Primary Queue",
				description: "Shared SQS queue for standard background jobs.",
				defaultEnabled: true,
			},
			{
				id: "track",
				label: "Track Replay Queue",
				description:
					"Dedicated async track replay queue used during fail-open recovery.",
				defaultEnabled: true,
			},
		]);
	});

	test("GET handles an unconfigured empty config", async () => {
		mockState.config = { queues: {} };
		mockState.status = {
			healthy: false,
			configured: false,
			lastSuccessAt: null,
			error: "missing s3 object",
		};

		const app = buildApp();
		const response = await app.request("http://localhost/admin/job-queue-config");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			queues: {},
			configHealthy: false,
			configConfigured: false,
			lastSuccessAt: null,
			error: "missing s3 object",
		});
		expect(body.knownQueues).toHaveLength(2);
	});

	test("PUT saves a validated config payload", async () => {
		const app = buildApp();

		const response = await app.request("http://localhost/admin/job-queue-config", {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				queues: {
					primary: { enabled: false },
					track: { enabled: true },
				},
			}),
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(mockState.updateCalls).toEqual([
			{
				queues: {
					primary: { enabled: false },
					track: { enabled: true },
				},
			},
		]);
	});

	test("PUT preserves unknown queues for future config expansion", async () => {
		const app = buildApp();

		const response = await app.request("http://localhost/admin/job-queue-config", {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				queues: {
					reports: { enabled: false },
				},
			}),
		});

		expect(response.status).toBe(200);
		expect(mockState.updateCalls).toEqual([
			{
				queues: {
					reports: { enabled: false },
				},
			},
		]);
	});

	test("PUT accepts an empty payload and writes the schema default", async () => {
		const app = buildApp();

		const response = await app.request("http://localhost/admin/job-queue-config", {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({}),
		});

		expect(response.status).toBe(200);
		expect(mockState.updateCalls).toEqual([{ queues: {} }]);
	});

	test("PUT rejects invalid queue payloads", async () => {
		const app = buildApp();

		const response = await app.request("http://localhost/admin/job-queue-config", {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				queues: {
					track: { enabled: "yes" },
				},
			}),
		});

		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.code).toBe(ErrCode.InvalidInputs);
		expect(mockState.updateCalls).toHaveLength(0);
	});
});
