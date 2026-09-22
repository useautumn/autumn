/**
 * Balance-neutral refresh-cache routes must flush cached balances to Postgres
 * before the subject is invalidated.
 *
 * Regression guard for the `balances.create` data loss: the route wiped the
 * shared balance hash without flushing, so a deduction still waiting on its
 * batched sync (SyncBatchingManagerV3, ~1s window) was dropped and the
 * rebuilt cache reverted to the pre-deduction balance.
 */

import { describe, expect, test } from "bun:test";
import { getRefreshCacheRouteConfig } from "@/honoMiddlewares/refreshCacheConfigs.js";

/** Routes that only insert/read rows and leave existing balances to the cache. */
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
