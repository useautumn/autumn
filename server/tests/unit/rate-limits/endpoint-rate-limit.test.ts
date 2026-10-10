import { afterEach, describe, expect, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isOverEndpointRateLimit } from "@/internal/misc/rateLimiter/isOverEndpointRateLimit.js";
import type { RateLimitOverridesConfig } from "@/internal/misc/rateLimiter/rateLimitOverridesSchemas.js";
import { _setRateLimitOverridesConfigForTesting } from "@/internal/misc/rateLimiter/rateLimitOverridesStore.js";

const createCounter = () => {
	const counts = new Map<string, number>();
	return {
		counts,
		incrWithExpiry: async (key: string) => {
			const next = (counts.get(key) ?? 0) + 1;
			counts.set(key, next);
			return next;
		},
	};
};

const toCtx = ({ orgId, slug }: { orgId: string; slug: string }) =>
	({ org: { id: orgId, slug }, env: "live" }) as unknown as AutumnContext;

const acme = toCtx({ orgId: "org_acme", slug: "acme" });
const other = toCtx({ orgId: "org_other", slug: "other" });

const setOverrides = (orgs: RateLimitOverridesConfig["orgs"]) =>
	_setRateLimitOverridesConfigForTesting({ config: { orgs } });

const hit = ({
	ctx = acme,
	method = "POST",
	path = "/v1/entities.delete",
	counter,
}: {
	ctx?: AutumnContext;
	method?: string;
	path?: string;
	counter: ReturnType<typeof createCounter>;
}) => isOverEndpointRateLimit({ ctx, method, path, counter, now: 0 });

afterEach(() => setOverrides({}));

describe("isOverEndpointRateLimit", () => {
	test("an override bites only its org and endpoint", async () => {
		setOverrides({
			org_acme: {
				limits: {},
				endpoints: { "POST /v1/entities.delete": { limit: 2, windowMs: 1000 } },
			},
		});
		const counter = createCounter();

		expect(await hit({ counter })).toBe(false);
		expect(await hit({ counter })).toBe(false);
		expect(await hit({ counter })).toBe(true);

		expect(await hit({ counter, ctx: other })).toBe(false);
		expect(await hit({ counter, path: "/v1/entities.create" })).toBe(false);
		expect(await hit({ counter, method: "GET" })).toBe(false);
		expect([...counter.counts.keys()]).toEqual([
			"hrl:endpoint:org_acme:live:POST /v1/entities.delete:0",
		]);
	});

	test("an org with no endpoint overrides costs no Redis call", async () => {
		setOverrides({ org_acme: { limits: { general: 5 } } });
		const counter = createCounter();

		for (const ctx of [acme, other]) {
			expect(await hit({ counter, ctx })).toBe(false);
		}
		expect(counter.counts.size).toBe(0);
	});

	test("a limit of 0 blocks the endpoint without counting", async () => {
		setOverrides({
			acme: {
				limits: {},
				endpoints: {
					"POST /v1/entities.delete": { limit: 0, windowMs: 60_000 },
				},
			},
		});
		const counter = createCounter();
		expect(await hit({ counter })).toBe(true);
		expect(counter.counts.size).toBe(0);
	});

	test("path params match like route groups and share one counter", async () => {
		setOverrides({
			org_acme: {
				limits: {},
				endpoints: {
					"GET /v1/customers/:customer_id": { limit: 1, windowMs: 1000 },
				},
			},
		});
		const counter = createCounter();

		expect(
			await hit({ counter, method: "GET", path: "/v1/customers/cus_1" }),
		).toBe(false);
		expect(
			await hit({ counter, method: "GET", path: "/v1/customers/cus_2" }),
		).toBe(true);
		expect(
			await hit({
				counter,
				method: "GET",
				path: "/v1/customers/cus_1/entities",
			}),
		).toBe(false);
	});

	test("a Redis failure lets the request through", async () => {
		setOverrides({
			org_acme: {
				limits: {},
				endpoints: { "POST /v1/entities.delete": { limit: 1, windowMs: 1000 } },
			},
		});
		const failing = {
			...createCounter(),
			incrWithExpiry: async () => {
				throw new Error("redis down");
			},
		};
		expect(await hit({ counter: failing })).toBe(false);
	});
});
