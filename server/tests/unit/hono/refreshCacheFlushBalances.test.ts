import { describe, expect, test } from "bun:test";
import { getRefreshCacheRouteConfig } from "@/honoMiddlewares/refreshCacheConfigs.js";

const BALANCE_NEUTRAL_ROUTES = [
	"/balances.create",
	"/balances/create",
	"/balances.update",
	"/balances/update",
	"/customers.update",
];

describe("refresh-cache flushBalances", () => {
	test.each(BALANCE_NEUTRAL_ROUTES)("%s flushes balances", (path) => {
		const config = getRefreshCacheRouteConfig({ method: "POST", path });

		expect(config).toBeDefined();
		expect(config?.flushBalances).toBe(true);
	});

	test("routes that rewrite balances in Postgres do not flush", () => {
		const config = getRefreshCacheRouteConfig({
			method: "POST",
			path: "/balances.delete",
		});

		expect(config).toBeDefined();
		expect(config?.flushBalances).toBeUndefined();
	});
});
