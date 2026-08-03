import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	_recentlyUpdatedNegativeCacheSizeForTesting,
	_resetRecentlyUpdatedNegativeCacheForTesting,
	isCustomerRecentlyUpdated,
	NEGATIVE_CACHE_MAX_ENTRIES,
	NEGATIVE_TTL_MS,
} from "@/internal/customers/customerLsns/isCustomerRecentlyUpdated.js";

const makeFakeDb = (impl: () => Promise<unknown[]> = async () => []) => {
	const execute = mock(impl);
	return { db: { execute } as unknown as DrizzleCli, execute };
};

const params = { orgId: "org_neg", env: "sandbox", customerId: "cus_neg" };

beforeEach(() => {
	_resetRecentlyUpdatedNegativeCacheForTesting();
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
});
