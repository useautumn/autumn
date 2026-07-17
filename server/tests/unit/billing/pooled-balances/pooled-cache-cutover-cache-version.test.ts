import { describe, expect, test } from "bun:test";
import type { SubjectBalance } from "@autumn/shared";
import { partitionSubjectBalancesByCacheVersion } from "@/internal/billing/v2/pooledBalances/execute/applyPooledBalanceCacheEffects.js";

const balance = ({ id, cacheVersion }: { id: string; cacheVersion: number }) =>
	({ id, cache_version: cacheVersion }) as SubjectBalance;

describe("pooled cache cutover cache-version guard", () => {
	test("keeps current snapshots and isolates stale or deleted rows", () => {
		const current = balance({ id: "current", cacheVersion: 2 });
		const stale = balance({ id: "stale", cacheVersion: 2 });
		const deleted = balance({ id: "deleted", cacheVersion: 2 });

		expect(
			partitionSubjectBalancesByCacheVersion({
				subjectBalances: [current, stale, deleted],
				currentCustomerEntitlements: [
					{ id: "current", cache_version: 2 },
					{ id: "stale", cache_version: 3 },
				],
			}),
		).toEqual({ syncable: [current], stale: [stale, deleted] });
	});
});
