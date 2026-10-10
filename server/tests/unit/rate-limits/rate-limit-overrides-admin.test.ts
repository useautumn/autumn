import { afterAll, describe, expect, mock, test } from "bun:test";
import { RecaseError, Scopes } from "@autumn/shared";
import { Hono } from "hono";
import { z } from "zod/v4";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	type RateLimitOverridesConfig,
	RateLimitOverridesConfigSchema,
} from "@/internal/misc/rateLimiter/rateLimitOverridesSchemas.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

let stored: RateLimitOverridesConfig = { orgs: {} };

await mockModuleWithRestore(
	"@/internal/misc/rateLimiter/rateLimitOverridesStore.js",
	() => ({
		updateFullRateLimitOverridesConfig: async ({
			config,
		}: {
			config: RateLimitOverridesConfig;
		}) => {
			stored = config;
		},
		getRateLimitOverridesFromSource: async () => stored,
	}),
);
await mockModuleWithRestore(
	"@/internal/admin/rateLimitOverrides/findRateLimitOverrideOrgs.js",
	() => ({ findRateLimitOverrideOrgs: async () => ({}) }),
);

const { handleGetAdminRateLimitOverridesConfig } = await import(
	"@/internal/admin/handleGetAdminRateLimitOverridesConfig.js"
);
const { handleUpsertAdminRateLimitOverridesConfig } = await import(
	"@/internal/admin/handleUpsertAdminRateLimitOverridesConfig.js"
);

const PATH = "/admin/rate-limit-overrides-config";

const createApp = () => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", { scopes: [Scopes.Superuser] } as never);
		await next();
	});
	app.onError(
		(error) =>
			new Response(error.message, {
				status:
					error instanceof RecaseError
						? error.statusCode
						: error instanceof z.ZodError
							? 400
							: 500,
			}),
	);
	app.get(PATH, ...handleGetAdminRateLimitOverridesConfig);
	app.put(PATH, ...handleUpsertAdminRateLimitOverridesConfig);
	return app;
};

const save = (config: unknown) =>
	createApp().request(PATH, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(config),
	});

const withEndpoints = (endpoints: Record<string, unknown>) => ({
	orgs: { org_a: { limits: {}, endpoints } },
});

describe("rate limit overrides config", () => {
	test("a config saved before endpoint overrides still parses unchanged", () => {
		const legacy = { orgs: { acme: { limits: { general: 50 } } } };
		expect(RateLimitOverridesConfigSchema.parse(legacy)).toEqual(legacy);
	});

	test("the admin upsert round-trips endpoint overrides", async () => {
		const config = {
			orgs: {
				org_a: {
					limits: { check_org: 300_000 },
					endpoints: {
						"POST /v1/entities.delete": { limit: 0, windowMs: 1000 },
						"GET /v1/customers/:customer_id": { limit: 600, windowMs: 60_000 },
					},
				},
			},
		};

		expect((await save(config)).status).toBe(200);
		expect(stored).toEqual(config);

		const loaded = await createApp().request(PATH);
		expect(loaded.status).toBe(200);
		const view = await loaded.json();
		expect(view.orgs).toEqual(config.orgs);
		expect(view.knownEndpoints).toContain("POST /v1/entities.delete");
	});

	test("rejects malformed endpoints, negative limits and empty windows", async () => {
		stored = { orgs: {} };
		const invalid = [
			withEndpoints({ "entities.delete": { limit: 1, windowMs: 1000 } }),
			withEndpoints({
				"FETCH /v1/entities.delete": { limit: 1, windowMs: 1000 },
			}),
			withEndpoints({ "POST /entities.delete": { limit: 1, windowMs: 1000 } }),
			withEndpoints({
				"POST /v1/entities.delete": { limit: -1, windowMs: 1000 },
			}),
			withEndpoints({ "POST /v1/entities.delete": { limit: 1, windowMs: 0 } }),
		];
		for (const config of invalid) {
			expect((await save(config)).status).toBe(400);
		}
		expect(stored).toEqual({ orgs: {} });
	});
});

afterAll(() => {
	mock.restore();
});
