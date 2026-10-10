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

/** An in-process Redis that runs the limiter's increment script and records each script's key count. */
const createFakeRedis = () => {
	const counters = new Map<string, { hits: number; expiresAt: number }>();
	const scriptKeyCounts: number[] = [];

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
		scriptKeyCounts,
		client: {
			script: async (_load: string, text: string) => {
				const sha = `sha${scripts.size}`;
				scripts.set(sha, text);
				return sha;
			},
			evalsha: async (
				sha: string,
				keyCount: number,
				key: string,
				...args: unknown[]
			) => {
				scriptKeyCounts.push(keyCount);
				if (!scripts.has(sha)) throw new Error("NOSCRIPT No matching script");
				return hit(key, Number(args[1]));
			},
			decr: async (key: string) => {
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
const {
	getLimiterForType,
	getOrgLimiterFor,
	getRateLimitKey,
	setRateLimitKeyInContext,
} = await import("@/internal/misc/rateLimiter/rateLimitFactory.js");
const { _setRateLimitOverridesConfigForTesting } = await import(
	"@/internal/misc/rateLimiter/rateLimitOverridesStore.js"
);

const ORG_ID = "org_then_customer";
const ORG_KEY = `hrl:sync_balance_write_org:${ORG_ID}:live`;
const customerKey = (customerId: string) =>
	`hrl:sync_balance_write:${ORG_ID}:live:${customerId}`;

/** The middleware's org-wraps-customer composition with a degrading org cap, which no Redis pair route uses yet. */
const degradingOrgMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const type = RateLimitType.SyncBalanceWrite;
	const orgLimit = getOrgLimiterFor({ type, overLimit: "degrade" });
	if (!orgLimit) throw new Error("SyncBalanceWrite has no org cap");
	setRateLimitKeyInContext(
		c as never,
		getRateLimitKey({ c, rateLimitType: orgLimit.type }),
	);
	let innerResponse: Response | undefined;
	const orgResponse = await orgLimit.limiter(c as Context<Env>, async () => {
		setRateLimitKeyInContext(
			c as never,
			getRateLimitKey({ c, rateLimitType: type }),
		);
		innerResponse =
			(await getLimiterForType(type)(c as Context<Env>, next)) ?? undefined;
	});
	return orgResponse ?? innerResponse;
};

const runRequests = async ({
	middleware,
	customers,
}: {
	middleware: (c: Context<HonoEnv>, next: Next) => Promise<unknown>;
	customers: string[];
}) => {
	const outcomes: { status: number; degraded: boolean }[] = [];
	for (const customerId of customers) {
		const app = new Hono<HonoEnv>();
		const ctx = {
			env: "live",
			org: { id: ORG_ID, slug: "org-then-customer" },
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
			degraded: ctx.orgRateLimitDegraded === true,
		});
	}
	return outcomes;
};

const hitsByKey = () =>
	new Map([...fakeRedis.counters].map(([key, { hits }]) => [key, hits]));

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

describe("org then customer Redis limiters", () => {
	test("a sync write is rejected by the customer cap, then by the org cap", async () => {
		const outcomes = await runRequests({
			middleware: (c, next) => rateLimitMiddleware(c, next),
			customers: CUSTOMERS,
		});

		expect(outcomes.map(({ status }) => status)).toEqual([
			200, 200, 429, 200, 429, 429,
		]);
	});

	// A customer 429 un-counts the org hit (hono-rate-limiter decrements an unfinalized context).
	test("the customer is only counted while the org is under its cap", async () => {
		await runRequests({
			middleware: (c, next) => rateLimitMiddleware(c, next),
			customers: CUSTOMERS,
		});

		const hits = hitsByKey();
		expect(hits.get(ORG_KEY)).toBe(5);
		expect(hits.get(customerKey("cus_a"))).toBe(3);
		expect(hits.get(customerKey("cus_b"))).toBe(1);
		expect(hits.has(customerKey("cus_c"))).toBe(false);
	});

	// A script over two keys is a multi-shard transaction on a multi-threaded Dragonfly.
	test("every Redis script touches a single key", async () => {
		await runRequests({
			middleware: (c, next) => rateLimitMiddleware(c, next),
			customers: CUSTOMERS,
		});

		expect(fakeRedis.scriptKeyCounts).toHaveLength(10);
		expect(new Set(fakeRedis.scriptKeyCounts)).toEqual(new Set([1]));
	});

	test("a degrading org cap still counts the customer", async () => {
		const outcomes = await runRequests({
			middleware: degradingOrgMiddleware,
			customers: CUSTOMERS,
		});

		expect(outcomes.map(({ status, degraded }) => [status, degraded])).toEqual([
			[200, false],
			[200, false],
			[429, false],
			[200, false],
			[200, true],
			[200, true],
		]);
		const hits = hitsByKey();
		expect(hits.get(customerKey("cus_b"))).toBe(2);
		expect(hits.get(customerKey("cus_c"))).toBe(1);
	});
});

afterAll(() => {
	mock.restore();
});
