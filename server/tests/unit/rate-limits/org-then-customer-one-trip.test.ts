import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { ApiVersion, ApiVersionClass } from "@autumn/shared";
import type { Context, Env } from "hono";
import { Hono, type Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

// Loaded scripts outlive a counter reset, as they do on a long-lived Redis.
const scripts = new Map<string, string>();

/** An in-process Redis that runs both limiter scripts and counts round trips. */
const createFakeRedis = () => {
	const counters = new Map<string, { hits: number; expiresAt: number }>();
	let roundTrips = 0;

	const hit = (key: string, windowMs: number) => {
		const now = Date.now();
		const entry = counters.get(key);
		const live = entry && entry.expiresAt > now ? entry : undefined;
		const next = live
			? { ...live, hits: live.hits + 1 }
			: { hits: 1, expiresAt: now + windowMs };
		counters.set(key, next);
		return [next.hits, next.expiresAt - now];
	};

	return {
		counters,
		roundTrips: () => roundTrips,
		client: {
			script: async (_load: string, text: string) => {
				const sha = `sha${scripts.size}`;
				scripts.set(sha, text);
				return sha;
			},
			evalsha: async (
				sha: string,
				_keyCount: number,
				key: string,
				...args: unknown[]
			) => {
				roundTrips++;
				if (!scripts.has(sha)) throw new Error("NOSCRIPT No matching script");
				return hit(key, Number(args[1]));
			},
			// Mirrors _luaScriptsMisc/rateLimit/incrementOrgThenCustomer.lua; the real script runs in the integration test.
			incrementOrgThenCustomer: async (
				orgKey: string,
				customerKey: string,
				orgWindowMs: number,
				orgLimit: number,
				countCustomerOverOrgLimit: string,
				customerWindowMs: number,
			) => {
				roundTrips++;
				const org = hit(orgKey, orgWindowMs);
				if (org[0] > orgLimit && countCustomerOverOrgLimit !== "1") return org;
				return [...org, ...hit(customerKey, customerWindowMs)];
			},
			decr: async (key: string) => {
				roundTrips++;
				const entry = counters.get(key);
				if (entry) entry.hits--;
				return entry?.hits ?? 0;
			},
			del: async (key: string) => {
				counters.delete(key);
				return 1;
			},
		},
	};
};

let fakeRedis = createFakeRedis();

await mockModuleWithRestore("@/external/redis/initRedis", () => ({
	shouldUseRedis: () => true,
	getMiscRedis: () => fakeRedis.client,
}));

const { rateLimitMiddleware } = await import(
	"@/honoMiddlewares/rateLimitMiddleware.js"
);
const { RateLimitType } = await import(
	"@/internal/misc/rateLimiter/rateLimitConfigs.js"
);
const { rateLimitFactory, getRateLimitKey, setRateLimitKeyInContext } =
	await import("@/internal/misc/rateLimiter/rateLimitFactory.js");
const { runOrgThenCustomerInOneTrip } = await import(
	"@/internal/misc/rateLimiter/runOrgThenCustomerInOneTrip.js"
);
const { RATE_LIMIT_CONFIGS } = await import(
	"@/internal/misc/rateLimiter/rateLimitConfigs.js"
);
const { _setRateLimitOverridesConfigForTesting } = await import(
	"@/internal/misc/rateLimiter/rateLimitOverridesStore.js"
);

type Outcome = {
	status: number;
	headers: Record<string, string | null>;
	degraded: boolean;
};

const ORG_ID = "org_one_trip";

/** The two-call composition rateLimitMiddleware used before pairs went to one Redis call. */
const twoCallMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
	{ overLimit }: { overLimit?: "degrade" },
) => {
	const type = RateLimitType.SyncBalanceWrite;
	const orgType = RateLimitType.SyncBalanceWriteOrg;
	const customerLimiter = rateLimitFactory({
		type,
		config: RATE_LIMIT_CONFIGS[type],
	});
	const orgLimiter = rateLimitFactory({
		type: orgType,
		config: RATE_LIMIT_CONFIGS[orgType],
		overLimit,
	});
	setRateLimitKeyInContext(
		c as never,
		getRateLimitKey({ c, rateLimitType: orgType }),
	);
	let innerResponse: Response | undefined;
	const orgResponse = await orgLimiter(c as Context<Env>, async () => {
		setRateLimitKeyInContext(
			c as never,
			getRateLimitKey({ c, rateLimitType: type }),
		);
		innerResponse =
			(await customerLimiter(c as Context<Env>, next)) ?? undefined;
	});
	return orgResponse ?? innerResponse;
};

const runRequests = async ({
	middleware,
	customers,
}: {
	middleware: (
		c: Context<HonoEnv>,
		next: Next,
	) => Promise<Response | undefined | void>;
	customers: string[];
}): Promise<Outcome[]> => {
	const outcomes: Outcome[] = [];
	for (const customerId of customers) {
		const app = new Hono<HonoEnv>();
		const ctx = {
			env: "live",
			org: { id: ORG_ID, slug: "one-trip" },
			customerId,
			apiVersion: new ApiVersionClass(ApiVersion.V2_5),
			requestBody: {
				customer_id: customerId,
				feature_id: "messages",
				async: false,
			},
			features: [],
			logger: { error: () => undefined },
		} as { orgRateLimitDegraded?: boolean };
		app.use("*", async (c, next) => {
			c.set("ctx", ctx as never);
			return middleware(c, next);
		});
		app.post("/v1/balances.track", (c) => c.json({ success: true }));
		const response = await app.request("/v1/balances.track", {
			method: "POST",
		});
		outcomes.push({
			status: response.status,
			headers: Object.fromEntries(
				[
					"RateLimit-Limit",
					"RateLimit-Remaining",
					"RateLimit-Policy",
					"Retry-After",
				].map((name) => [name, response.headers.get(name)]),
			),
			degraded: ctx.orgRateLimitDegraded === true,
		});
	}
	return outcomes;
};

// Org cap 3 across customers, customer cap 2: covers both 429s and an over-cap org.
const CUSTOMERS = ["cus_a", "cus_a", "cus_a", "cus_b", "cus_b", "cus_c"];

beforeEach(() => {
	fakeRedis = createFakeRedis();
	_setRateLimitOverridesConfigForTesting({
		config: {
			orgs: {
				[ORG_ID]: {
					limits: {
						[RateLimitType.SyncBalanceWrite]: 2,
						[RateLimitType.SyncBalanceWriteOrg]: 3,
					},
				},
			},
		},
	});
});

afterEach(() => {
	_setRateLimitOverridesConfigForTesting({ config: { orgs: {} } });
});

const runBothPaths = async ({
	overLimit,
	oneTrip = (c, next) => rateLimitMiddleware(c, next),
}: {
	overLimit?: "degrade";
	oneTrip?: (
		c: Context<HonoEnv>,
		next: Next,
	) => Promise<Response | undefined | void>;
}) => {
	const before = await runRequests({
		middleware: (c, next) => twoCallMiddleware(c, next, { overLimit }),
		customers: CUSTOMERS,
	});
	const beforeCounters = new Map(
		[...fakeRedis.counters].map(([key, { hits }]) => [key, hits]),
	);
	const beforeTrips = fakeRedis.roundTrips();

	fakeRedis = createFakeRedis();
	const after = await runRequests({
		middleware: oneTrip,
		customers: CUSTOMERS,
	});
	const afterCounters = new Map(
		[...fakeRedis.counters].map(([key, { hits }]) => [key, hits]),
	);
	return {
		before,
		after,
		beforeCounters,
		afterCounters,
		beforeTrips,
		afterTrips: fakeRedis.roundTrips(),
	};
};

describe("org then customer in one Redis round trip", () => {
	test("same statuses, headers and Redis counters as the two-call limiters", async () => {
		const run = await runBothPaths({});

		expect(run.after).toEqual(run.before);
		expect(run.afterCounters).toEqual(run.beforeCounters);
		expect(run.before.map(({ status }) => status)).toEqual([
			200, 200, 429, 200, 429, 429,
		]);
	});

	// A customer 429 un-counts the org hit (hono-rate-limiter decrements an unfinalized context).
	test("the customer is only counted while the org is under its cap", async () => {
		const { afterCounters } = await runBothPaths({});

		expect(afterCounters.get(`hrl:sync_balance_write_org:${ORG_ID}:live`)).toBe(
			5,
		);
		expect(
			afterCounters.get(`hrl:sync_balance_write:${ORG_ID}:live:cus_a`),
		).toBe(3);
		expect(
			afterCounters.has(`hrl:sync_balance_write:${ORG_ID}:live:cus_c`),
		).toBe(false);
	});

	test("a degrading org cap still counts the customer, as the two-call limiters did", async () => {
		const run = await runBothPaths({
			overLimit: "degrade",
			oneTrip: (c, next) =>
				runOrgThenCustomerInOneTrip({
					c,
					next,
					type: RateLimitType.SyncBalanceWrite,
					orgType: RateLimitType.SyncBalanceWriteOrg,
					overLimit: "degrade",
					key: getRateLimitKey({
						c,
						rateLimitType: RateLimitType.SyncBalanceWrite,
					}),
					orgKey: getRateLimitKey({
						c,
						rateLimitType: RateLimitType.SyncBalanceWriteOrg,
					}),
				}),
		});

		expect(run.after).toEqual(run.before);
		expect(run.afterCounters).toEqual(run.beforeCounters);
		expect(
			run.before.map(({ status, degraded }) => [status, degraded]),
		).toEqual([
			[200, false],
			[200, false],
			[429, false],
			[200, false],
			[200, true],
			[200, true],
		]);
	});

	test("one Redis call per request instead of two", async () => {
		const { beforeTrips, afterTrips } = await runBothPaths({});

		// Six org hits and four customer hits, plus one org un-count for the customer 429.
		expect(beforeTrips).toBe(11);
		expect(afterTrips).toBe(7);
	});
});

afterAll(() => {
	mock.restore();
});
