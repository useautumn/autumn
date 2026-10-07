import { describe, expect, test } from "bun:test";
import { listRateLimitDefaults } from "@/internal/misc/rateLimiter/policies/listRateLimitDefaults.js";
import {
	RATE_LIMIT_CONFIGS,
	RATE_LIMIT_ROUTE_GROUPS,
} from "@/internal/misc/rateLimiter/rateLimitConfigs.js";
import {
	describeLegacyRateLimit,
	listLegacyPerPodLimiters,
} from "./golden/describeLegacyRateLimit.js";
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

const listLegacyAdminDefaults = () =>
	Object.fromEntries(
		Object.entries(RATE_LIMIT_CONFIGS).map(([type, config]) => [
			type,
			{ limit: config.limit, windowMs: config.windowMs, scope: config.scope },
		]),
	);

describe("rate-limit golden resolution", () => {
	test("golden routes cover every route in the legacy table", () => {
		const goldenRouteKeys = GOLDEN_ROUTES.map(
			({ method, path }) => `${method} ${path}`,
		);
		for (const { patterns } of RATE_LIMIT_ROUTE_GROUPS) {
			for (const { method, url } of patterns) {
				expect(goldenRouteKeys).toContain(`${method} ${toGoldenPath(url)}`);
			}
		}
	});

	test("every route × API version resolves to the recorded layers", () => {
		const resolved = describeAllGoldenRoutes({
			describeRateLimit: describeRateLimitPolicy,
		});
		expect(resolved).toEqual(
			describeAllGoldenRoutes({ describeRateLimit: describeLegacyRateLimit }),
		);
		expect(resolved).toMatchSnapshot();
	});

	test("admin defaults match the recorded layer defaults", () => {
		expect(listRateLimitDefaults()).toEqual(listLegacyAdminDefaults());
		expect(
			toEnvironmentStableDefaults(listRateLimitDefaults()),
		).toMatchSnapshot();
	});

	test("routes share per-pod limiters exactly where they did", () => {
		const grouped = groupRoutesByPerPodLimiter({
			listPerPodLimiters: listPolicyPerPodLimiters,
		});
		expect(grouped).toEqual(
			groupRoutesByPerPodLimiter({
				listPerPodLimiters: listLegacyPerPodLimiters,
			}),
		);
		expect(grouped).toMatchSnapshot();
	});
});
