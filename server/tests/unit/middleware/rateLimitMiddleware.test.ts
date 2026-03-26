import { describe, expect, mock, test } from "bun:test";
import chalk from "chalk";
import type { Context } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv";

// Mock Redis before any transitive imports touch initRedis
mock.module("@/external/redis/initRedis", () => ({
	redis: {
		script: () => Promise.reject(new Error("Redis unavailable")),
		evalsha: () => Promise.reject(new Error("Redis unavailable")),
		decr: () => Promise.reject(new Error("Redis unavailable")),
		del: () => Promise.reject(new Error("Redis unavailable")),
	},
	currentRegion: "us-west-2",
	getRegionalRedis: () => ({}),
	getConfiguredRegions: () => [],
	warmupRegionalRedis: () => Promise.resolve(),
	configureRedisInstance: (r: unknown) => r,
	getPrimaryRedis: () => ({}),
}));

import { rateLimitMiddleware } from "@/honoMiddlewares/rateLimitMiddleware";
import {
	getRateLimitType,
	RateLimitType,
} from "@/internal/misc/rateLimiter/rateLimitConfigs";
import { getRateLimitKey } from "@/internal/misc/rateLimiter/rateLimitFactory";

/**
 * Hono doesn't export Context as a runtime class, so we build minimal stubs
 * matching the shape each function actually reads. The cast is contained here
 * so individual tests stay clean.
 */
const stubHonoContext = ({
	method,
	path,
	ctx,
}: {
	method: string;
	path: string;
	ctx?: Partial<AutumnContext>;
}): Context<HonoEnv> => {
	const store = new Map<string, unknown>();
	if (ctx) store.set("ctx", ctx);

	return {
		req: { method, path },
		get: (key: string) => store.get(key),
		set: (key: string, value: unknown) => store.set(key, value),
		header: () => {},
		status: () => {},
		body: () => {},
	} as unknown as Context<HonoEnv>;
};

const makeContext = ({ method, path }: { method: string; path: string }) =>
	stubHonoContext({ method, path });

const makeKeyContext = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId?: string;
}) =>
	stubHonoContext({
		method: "GET",
		path: "/test",
		ctx: {
			org: { id: orgId } as AutumnContext["org"],
			env,
			customerId,
		} as Partial<AutumnContext>,
	});

const makeMiddlewareContext = ({
	method,
	path,
	orgId,
	env,
	customerId,
}: {
	method: string;
	path: string;
	orgId: string;
	env: string;
	customerId?: string;
}) => {
	const errorSpy = mock((_message: string) => {});
	const context = stubHonoContext({
		method,
		path,
		ctx: {
			org: { id: orgId } as AutumnContext["org"],
			env,
			customerId,
			logger: { error: errorSpy } as unknown as AutumnContext["logger"],
		} as Partial<AutumnContext>,
	});
	return { context, errorSpy };
};

// ─── getRateLimitType ────────────────────────────────────────────────

describe(chalk.yellowBright("getRateLimitType"), () => {
	describe(chalk.cyan("Track endpoints"), () => {
		const trackRoutes = [
			{ method: "POST", path: "/v1/events" },
			{ method: "POST", path: "/v1/track" },
			{ method: "POST", path: "/v1/balances.track" },
			{ method: "POST", path: "/v1/balances.finalize" },
			{ method: "POST", path: "/v1/usage" },
			{ method: "POST", path: "/v1/balances/update" },
			{ method: "POST", path: "/v1/balances.update" },
		];

		for (const { method, path } of trackRoutes) {
			test(`${method} ${path} → Track`, () => {
				const c = makeContext({ method, path });
				expect(getRateLimitType(c)).toBe(RateLimitType.Track);
			});
		}
	});

	describe(chalk.cyan("Check endpoints"), () => {
		const checkRoutes = [
			{ method: "POST", path: "/v1/check" },
			{ method: "POST", path: "/v1/entitled" },
			{ method: "POST", path: "/v1/balances.check" },
			{ method: "GET", path: "/v1/customers/cus_123" },
			{ method: "GET", path: "/v1/customers/cus_abc/entities/ent_1" },
			{ method: "POST", path: "/v1/customers" },
			{ method: "POST", path: "/v1/customers.get_or_create" },
			{ method: "POST", path: "/v1/entities.get" },
		];

		for (const { method, path } of checkRoutes) {
			test(`${method} ${path} → Check`, () => {
				const c = makeContext({ method, path });
				expect(getRateLimitType(c)).toBe(RateLimitType.Check);
			});
		}
	});

	describe(chalk.cyan("Events endpoints"), () => {
		const eventsRoutes = [
			{ method: "POST", path: "/v1/events/list" },
			{ method: "POST", path: "/v1/events/aggregate" },
			{ method: "POST", path: "/v1/query" },
			{ method: "POST", path: "/v1/events.list" },
			{ method: "POST", path: "/v1/events.aggregate" },
		];

		for (const { method, path } of eventsRoutes) {
			test(`${method} ${path} → Events`, () => {
				const c = makeContext({ method, path });
				expect(getRateLimitType(c)).toBe(RateLimitType.Events);
			});
		}
	});

	describe(chalk.cyan("Attach endpoints"), () => {
		const attachRoutes = [
			{ method: "POST", path: "/v1/attach" },
			{ method: "POST", path: "/v1/billing.attach" },
			{ method: "POST", path: "/v1/billing.multi_attach" },
			{ method: "POST", path: "/v1/billing.update" },
		];

		for (const { method, path } of attachRoutes) {
			test(`${method} ${path} → Attach`, () => {
				const c = makeContext({ method, path });
				expect(getRateLimitType(c)).toBe(RateLimitType.Attach);
			});
		}
	});

	describe(chalk.cyan("ListProducts endpoints"), () => {
		const listProductsRoutes = [
			{ method: "GET", path: "/v1/products" },
			{ method: "GET", path: "/v1/products_beta" },
			{ method: "GET", path: "/v1/plans" },
			{ method: "POST", path: "/v1/plans.list" },
		];

		for (const { method, path } of listProductsRoutes) {
			test(`${method} ${path} → ListProducts`, () => {
				const c = makeContext({ method, path });
				expect(getRateLimitType(c)).toBe(RateLimitType.ListProducts);
			});
		}
	});

	describe(chalk.cyan("General fallback"), () => {
		const generalRoutes = [
			{ method: "GET", path: "/v1/some-random-page" },
			{ method: "POST", path: "/v1/unknown-endpoint" },
			{ method: "DELETE", path: "/v1/customers/cus_123" },
			{ method: "GET", path: "/health" },
		];

		for (const { method, path } of generalRoutes) {
			test(`${method} ${path} → General`, () => {
				const c = makeContext({ method, path });
				expect(getRateLimitType(c)).toBe(RateLimitType.General);
			});
		}
	});

	describe(chalk.cyan("wrong method does not match"), () => {
		test("GET /v1/events → General (track requires POST)", () => {
			const c = makeContext({ method: "GET", path: "/v1/events" });
			expect(getRateLimitType(c)).toBe(RateLimitType.General);
		});

		test("GET /v1/attach → General (attach requires POST)", () => {
			const c = makeContext({ method: "GET", path: "/v1/attach" });
			expect(getRateLimitType(c)).toBe(RateLimitType.General);
		});

		test("POST /v1/products → General (listProducts requires GET)", () => {
			const c = makeContext({ method: "POST", path: "/v1/products" });
			expect(getRateLimitType(c)).toBe(RateLimitType.General);
		});
	});
});

// ─── getRateLimitKey ─────────────────────────────────────────────────

describe(chalk.yellowBright("getRateLimitKey"), () => {
	test("Org-scoped (General) → name:orgId:env", () => {
		const c = makeKeyContext({
			orgId: "org_abc",
			env: "live",
		});
		const key = getRateLimitKey({ c, rateLimitType: RateLimitType.General });
		expect(key).toBe("general:org_abc:live");
	});

	test("Org-scoped (ListProducts) → name:orgId:env", () => {
		const c = makeKeyContext({
			orgId: "org_xyz",
			env: "sandbox",
		});
		const key = getRateLimitKey({
			c,
			rateLimitType: RateLimitType.ListProducts,
		});
		expect(key).toBe("list_products:org_xyz:sandbox");
	});

	test("Customer-scoped (Track) → name:orgId:env:customerId", () => {
		const c = makeKeyContext({
			orgId: "org_abc",
			env: "live",
			customerId: "cus_123",
		});
		const key = getRateLimitKey({ c, rateLimitType: RateLimitType.Track });
		expect(key).toBe("track:org_abc:live:cus_123");
	});

	test("Customer-scoped (Events) → name:orgId:env:customerId", () => {
		const c = makeKeyContext({
			orgId: "org_abc",
			env: "sandbox",
			customerId: "cus_456",
		});
		const key = getRateLimitKey({ c, rateLimitType: RateLimitType.Events });
		expect(key).toBe("events:org_abc:sandbox:cus_456");
	});

	test("Customer-scoped (Attach) → name:orgId:env:customerId", () => {
		const c = makeKeyContext({
			orgId: "org_abc",
			env: "live",
			customerId: "cus_789",
		});
		const key = getRateLimitKey({ c, rateLimitType: RateLimitType.Attach });
		expect(key).toBe("attach:org_abc:live:cus_789");
	});

	test("CustomerWithUrlFallback (Check) → name:orgId:env:customerId", () => {
		const c = makeKeyContext({
			orgId: "org_abc",
			env: "live",
			customerId: "cus_check",
		});
		const key = getRateLimitKey({ c, rateLimitType: RateLimitType.Check });
		expect(key).toBe("check:org_abc:live:cus_check");
	});

	test("undefined customerId appends 'undefined' for customer-scoped keys", () => {
		const c = makeKeyContext({
			orgId: "org_abc",
			env: "live",
		});
		const key = getRateLimitKey({ c, rateLimitType: RateLimitType.Track });
		expect(key).toBe("track:org_abc:live:undefined");
	});
});

// ─── rateLimitMiddleware fail-open ───────────────────────────────────

describe(chalk.yellowBright("rateLimitMiddleware fail-open"), () => {
	test("calls next() exactly once when Redis-backed limiter throws", async () => {
		const nextSpy = mock(() => Promise.resolve());
		const { context, errorSpy } = makeMiddlewareContext({
			method: "GET",
			path: "/v1/some-random-page",
			orgId: "org_failopen",
			env: "live",
			customerId: "cus_test",
		});

		await rateLimitMiddleware(context, nextSpy);

		expect(nextSpy).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalled();
	});

	test("resolves (does not reject) when Redis is down", async () => {
		const nextSpy = mock(() => Promise.resolve());
		const { context } = makeMiddlewareContext({
			method: "GET",
			path: "/v1/some-random-page",
			orgId: "org_failopen2",
			env: "sandbox",
		});

		const result = rateLimitMiddleware(context, nextSpy);
		await expect(result).resolves.toBeUndefined();
	});

	test("logs the error via ctx.logger.error", async () => {
		const nextSpy = mock(() => Promise.resolve());
		const { context, errorSpy } = makeMiddlewareContext({
			method: "GET",
			path: "/v1/some-random-page",
			orgId: "org_logtest",
			env: "live",
		});

		await rateLimitMiddleware(context, nextSpy);

		expect(errorSpy).toHaveBeenCalledTimes(1);
		const logMessage = errorSpy.mock.calls[0]?.[0];
		expect(logMessage).toContain("Error checking rate limit");
		expect(logMessage).toContain("Bypassing for now");
	});
});
