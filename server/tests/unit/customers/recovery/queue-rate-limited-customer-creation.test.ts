import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

const mockState = {
	queueCalls: [] as Record<string, unknown>[],
};

mock.module(
	"@/internal/customers/recovery/queueFailedCustomerCreation.js",
	() => ({
		queueFailedCustomerCreation: async (args: Record<string, unknown>) => {
			mockState.queueCalls.push(args);
			return true;
		},
	}),
);

const { queueRateLimitedCustomerCreation } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/customers/recovery/queueRateLimitedCustomerCreation.js?rateLimitRecovery"
);

const buildApp = () => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		const requestBody = await c.req.json();
		c.set("ctx", {
			id: "req_rate_limited_123",
			org: { id: "org_123" },
			env: AppEnv.Live,
			apiVersion: new ApiVersionClass(ApiVersion.V2_1),
			extraLogs: {},
			logger: {
				error: mock(() => {}),
			},
			requestBody,
		} as never);
		await next();
	});
	app.post("*", async (c) =>
		c.json({
			queued: await queueRateLimitedCustomerCreation({ c }),
		}),
	);
	return app;
};

describe("queueRateLimitedCustomerCreation", () => {
	beforeEach(() => {
		mockState.queueCalls = [];
	});

	test("captures a validated customers.get_or_create request", async () => {
		const app = buildApp();
		const response = await app.request(
			"http://localhost/v1/customers.get_or_create",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					customer_id: "customer_123",
					email: "customer@example.com",
					entity_id: "entity_123",
					entity_data: { name: "Workspace", feature_id: "seats" },
					with_autumn_id: true,
				}),
			},
		);

		expect(await response.json()).toEqual({ queued: true });
		expect(mockState.queueCalls).toEqual([
			expect.objectContaining({
				params: {
					customer_id: "customer_123",
					customer_data: {
						email: "customer@example.com",
					},
					entity_id: "entity_123",
					entity_data: { name: "Workspace", feature_id: "seats" },
				},
				source: "rateLimit:customers.get_or_create",
				withAutumnId: true,
				failureStage: "lookup",
			}),
		]);
	});

	test("captures a validated legacy customer create request", async () => {
		const app = buildApp();
		const response = await app.request(
			"http://localhost/v1/customers?with_autumn_id=true",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					id: "customer_legacy",
					email: "legacy@example.com",
				}),
			},
		);

		expect(await response.json()).toEqual({ queued: true });
		expect(mockState.queueCalls).toEqual([
			expect.objectContaining({
				params: {
					customer_id: "customer_legacy",
					customer_data: {
						email: "legacy@example.com",
					},
				},
				source: "rateLimit:customers",
				withAutumnId: true,
				failureStage: "lookup",
			}),
		]);
	});

	test("does not queue invalid or unrelated requests", async () => {
		const app = buildApp();
		const invalidResponse = await app.request(
			"http://localhost/v1/customers.get_or_create",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ customer_id: null }),
			},
		);
		const fetchResponse = await app.request(
			"http://localhost/v1/customers.get",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ customer_id: "customer_123" }),
			},
		);

		expect(await invalidResponse.json()).toEqual({ queued: false });
		expect(await fetchResponse.json()).toEqual({ queued: false });
		expect(mockState.queueCalls).toHaveLength(0);
	});
});
