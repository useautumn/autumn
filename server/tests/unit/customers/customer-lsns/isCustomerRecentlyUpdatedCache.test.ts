import {
	afterAll,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";

// lru-cache expires entries via performance.now(); an offset patch fast-forwards
// the TTL without sleeping real time.
const realPerformanceNow = performance.now.bind(performance);
let clockOffsetMs = 0;
performance.now = () => realPerformanceNow() + clockOffsetMs;
// The macrotask yield lets lru-cache's 1ms cachedNow debounce timer clear —
// without it the pre-advance timestamp stays cached and nothing expires.
const advanceClock = async (ms: number) => {
	clockOffsetMs += ms;
	await Bun.sleep(2);
};
afterAll(() => {
	performance.now = realPerformanceNow;
});

import { type DrizzleCli, dbGeneral } from "@/db/initDrizzle.js";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	_recentlyUpdatedNegativeCacheSizeForTesting,
	_resetRecentlyUpdatedNegativeCacheForTesting,
	isCustomerRecentlyUpdated,
	NEGATIVE_CACHE_MAX_ENTRIES,
	NEGATIVE_TTL_MS,
} from "@/internal/customers/customerLsns/isCustomerRecentlyUpdated.js";
import {
	markCustomersUpdatedAt,
	markCustomersUpdatedAtByInternalIds,
	markCustomerUpdatedAt,
} from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";

const makeFakeDb = (impl: () => Promise<unknown[]> = async () => []) => {
	const execute = mock(impl);
	return { db: { execute } as unknown as DrizzleCli, execute };
};

// A pool-like caller handle ($client), the shape replicaDbMiddleware swaps in —
// marks must never write through it.
const makeFakeMarkDb = () => {
	const execute = mock(async (): Promise<unknown[]> => {
		throw new Error("caller handle must not receive the mark");
	});
	return { db: { $client: {}, execute } as unknown as DrizzleCli, execute };
};

// Marks always write through the primary pool; observe it without a real DB.
const primaryExecute = spyOn(dbGeneral, "execute");

afterAll(() => {
	primaryExecute.mockRestore();
});

const params = { orgId: "org_neg", env: "sandbox", customerId: "cus_neg" };

beforeEach(() => {
	_resetRecentlyUpdatedNegativeCacheForTesting();
	primaryExecute.mockClear();
	primaryExecute.mockImplementation(async () => []);
});

describe("isCustomerRecentlyUpdated negative cache", () => {
	it("caches a negative result: second call within TTL does zero DB queries", async () => {
		const { db, execute } = makeFakeDb();

		expect(await isCustomerRecentlyUpdated({ db, ...params })).toBe(false);
		expect(await isCustomerRecentlyUpdated({ db, ...params })).toBe(false);

		expect(execute).toHaveBeenCalledTimes(1);
	});

	it("never caches a positive result: every call queries", async () => {
		const { db, execute } = makeFakeDb(async () => [{ fresh: true }]);

		expect(await isCustomerRecentlyUpdated({ db, ...params })).toBe(true);
		expect(await isCustomerRecentlyUpdated({ db, ...params })).toBe(true);

		expect(execute).toHaveBeenCalledTimes(2);
	});

	it("re-queries once the negative TTL lapses", async () => {
		const { db, execute } = makeFakeDb();

		await isCustomerRecentlyUpdated({ db, ...params });
		await new Promise((resolve) => setTimeout(resolve, NEGATIVE_TTL_MS + 100));
		await isCustomerRecentlyUpdated({ db, ...params });

		expect(execute).toHaveBeenCalledTimes(2);
	});

	it("never caches errors: the next call queries again", async () => {
		let calls = 0;
		const { db, execute } = makeFakeDb(async () => {
			calls++;
			if (calls === 1) {
				throw new Error("db down");
			}
			return [];
		});

		await expect(isCustomerRecentlyUpdated({ db, ...params })).rejects.toThrow(
			"db down",
		);
		expect(await isCustomerRecentlyUpdated({ db, ...params })).toBe(false);

		expect(execute).toHaveBeenCalledTimes(2);
	});

	it("stays bounded: max + 1 distinct keys keep size at the LRU max", async () => {
		const { db } = makeFakeDb();

		for (let i = 0; i <= NEGATIVE_CACHE_MAX_ENTRIES; i++) {
			await isCustomerRecentlyUpdated({
				db,
				orgId: "org_bound",
				env: "sandbox",
				customerId: `cus_${i}`,
			});
		}

		expect(_recentlyUpdatedNegativeCacheSizeForTesting()).toBe(
			NEGATIVE_CACHE_MAX_ENTRIES,
		);
	});

	it("_reset helper clears cached negatives", async () => {
		const { db, execute } = makeFakeDb();

		await isCustomerRecentlyUpdated({ db, ...params });
		_resetRecentlyUpdatedNegativeCacheForTesting();
		await isCustomerRecentlyUpdated({ db, ...params });

		expect(execute).toHaveBeenCalledTimes(2);
	});

	it("a mark drops the cached negative: the very next check sees the write", async () => {
		let fresh = false;
		const { db, execute } = makeFakeDb(async () =>
			fresh ? [{ fresh: true }] : [],
		);

		expect(await isCustomerRecentlyUpdated({ db, ...params })).toBe(false);

		// Without invalidation the cached negative would mask the fresh row.
		fresh = true;
		expect(await isCustomerRecentlyUpdated({ db, ...params })).toBe(false);
		expect(execute).toHaveBeenCalledTimes(1);

		const mark = makeFakeMarkDb();
		await markCustomerUpdatedAt({ db: mark.db, ...params });
		expect(mark.execute).not.toHaveBeenCalled();

		expect(await isCustomerRecentlyUpdated({ db, ...params })).toBe(true);
		expect(execute).toHaveBeenCalledTimes(2);
	});

	it("bulk mark drops the cached negative for every customer it stamps", async () => {
		const other = { orgId: "org_neg", env: "sandbox", customerId: "cus_neg_2" };
		const { db, execute } = makeFakeDb();

		await isCustomerRecentlyUpdated({ db, ...params });
		await isCustomerRecentlyUpdated({ db, ...other });
		expect(execute).toHaveBeenCalledTimes(2);

		const mark = makeFakeMarkDb();
		await markCustomersUpdatedAt({
			db: mark.db,
			customers: [params, other],
		});
		expect(mark.execute).not.toHaveBeenCalled();

		await isCustomerRecentlyUpdated({ db, ...params });
		await isCustomerRecentlyUpdated({ db, ...other });
		expect(execute).toHaveBeenCalledTimes(4);
	});

	it("internal-id mark drops cached negatives for the identities it resolves", async () => {
		const { db, execute } = makeFakeDb();

		await isCustomerRecentlyUpdated({ db, ...params });
		expect(execute).toHaveBeenCalledTimes(1);

		// The pool-path mark resolves identities via RETURNING on the primary pool.
		const resolvedRows = [
			{
				org_id: params.orgId,
				env: params.env,
				customer_id: params.customerId,
			},
		] as never[];
		primaryExecute.mockImplementation(async () => resolvedRows);
		const mark = makeFakeMarkDb();
		await markCustomersUpdatedAtByInternalIds({
			db: mark.db,
			internalCustomerIds: ["internal_neg"],
		});
		expect(mark.execute).not.toHaveBeenCalled();

		await isCustomerRecentlyUpdated({ db, ...params });
		expect(execute).toHaveBeenCalledTimes(2);
	});
});
