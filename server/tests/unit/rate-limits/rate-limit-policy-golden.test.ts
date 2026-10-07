import { describe, expect, test } from "bun:test";
import { listRateLimitDefaults } from "@/internal/misc/rateLimiter/policies/listRateLimitDefaults.js";
import { RATE_LIMIT_POLICIES } from "@/internal/misc/rateLimiter/policies/rateLimitPolicies.js";
import {
	describeRateLimitPolicy,
	listPolicyPerPodLimiters,
} from "./golden/describeRateLimitPolicy.js";
import {
	describeAllGoldenRoutes,
	GOLDEN_ROUTES,
	groupRoutesByPerPodLimiter,
	toEnvironmentStableLimit,
} from "./golden/goldenRateLimitRequests.js";

const toEnvironmentStableDefaults = (
	defaults: Record<string, { limit: number; windowMs: number; scope: string }>,
) =>
	Object.fromEntries(
		Object.entries(defaults).map(([name, entry]) => [
			name,
			{
				...entry,
				limit: toEnvironmentStableLimit({ name, limit: entry.limit }),
			},
		]),
	);

const toGoldenPath = (url: string) =>
	url.replace(":customer_id", "cus_golden").replace(":entity_id", "ent_golden");

describe("rate-limit golden resolution", () => {
	test("golden routes cover every route in the policy table", () => {
		const goldenRouteKeys = GOLDEN_ROUTES.map(
			({ method, path }) => `${method} ${path}`,
		);
		for (const { routes } of RATE_LIMIT_POLICIES) {
			if (routes === "*") continue;
			for (const { method, url } of routes) {
				expect(goldenRouteKeys).toContain(`${method} ${toGoldenPath(url)}`);
			}
		}
	});

	test("every route × API version resolves to the recorded layers", () => {
		expect(
			describeAllGoldenRoutes({ describeRateLimit: describeRateLimitPolicy }),
		).toMatchSnapshot();
	});

	test("admin defaults match the recorded layer defaults", () => {
		expect(
			toEnvironmentStableDefaults(listRateLimitDefaults()),
		).toMatchSnapshot();
	});

	test("routes share per-pod limiters exactly where they did", () => {
		expect(
			groupRoutesByPerPodLimiter({
				listPerPodLimiters: listPolicyPerPodLimiters,
			}),
		).toMatchSnapshot();
	});
});
