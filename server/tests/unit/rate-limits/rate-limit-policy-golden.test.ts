import { describe, expect, test } from "bun:test";
import {
	RATE_LIMIT_CONFIGS,
	RATE_LIMIT_ROUTE_GROUPS,
} from "@/internal/misc/rateLimiter/rateLimitConfigs.js";
import { describeLegacyRateLimit } from "./golden/describeLegacyRateLimit.js";
import {
	describeAllGoldenRoutes,
	GOLDEN_ROUTES,
} from "./golden/goldenRateLimitRequests.js";

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
		expect(
			describeAllGoldenRoutes({ describeRateLimit: describeLegacyRateLimit }),
		).toMatchSnapshot();
	});

	test("admin defaults match the recorded layer defaults", () => {
		expect(listLegacyAdminDefaults()).toMatchSnapshot();
	});
});
