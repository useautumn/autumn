import { describe, expect, test } from "bun:test";
import type { OrgRedisConfig } from "@autumn/shared";
import {
	getCustomerBucket,
	isRedisMigrationCacheStale,
} from "@/external/redis/customerRedisRoutingInfo.js";

const makeConfig = (
	overrides: Partial<OrgRedisConfig> = {},
): OrgRedisConfig => ({
	connectionString: "encrypted",
	url: "dragonfly.internal:6379",
	migrationPercent: 50,
	previousMigrationPercent: 0,
	migrationChangedAt: 1000,
	...overrides,
});

const findCustomerInBucketRange = ({
	min,
	max,
}: {
	min: number;
	max: number;
}): string => {
	for (let index = 0; index < 10_000; index++) {
		const customerId = `cus_stale_${index}`;
		const bucket = getCustomerBucket(customerId);
		if (bucket >= min && bucket < max) return customerId;
	}
	throw new Error(`No customer found in bucket range [${min}, ${max})`);
};

describe("isRedisMigrationCacheStale", () => {
	test("marks cache stale when a forward migration moves the customer to dedicated Redis", () => {
		const customerId = findCustomerInBucketRange({ min: 0, max: 50 });

		expect(
			isRedisMigrationCacheStale({
				cachedAt: 500,
				customerId,
				redisConfig: makeConfig({
					migrationPercent: 50,
					previousMigrationPercent: 0,
					migrationChangedAt: 1000,
				}),
			}),
		).toBe(true);
	});

	test("keeps cache fresh when a forward migration does not move the customer", () => {
		const customerId = findCustomerInBucketRange({ min: 50, max: 100 });

		expect(
			isRedisMigrationCacheStale({
				cachedAt: 500,
				customerId,
				redisConfig: makeConfig({
					migrationPercent: 50,
					previousMigrationPercent: 0,
					migrationChangedAt: 1000,
				}),
			}),
		).toBe(false);
	});

	test("marks cache stale when rollback moves the customer back to shared Redis", () => {
		const customerId = findCustomerInBucketRange({ min: 20, max: 50 });

		expect(
			isRedisMigrationCacheStale({
				cachedAt: 1500,
				customerId,
				redisConfig: makeConfig({
					migrationPercent: 20,
					previousMigrationPercent: 50,
					migrationChangedAt: 2000,
				}),
			}),
		).toBe(true);
	});

	test("keeps cache fresh when it was written after the migration changed", () => {
		const customerId = findCustomerInBucketRange({ min: 0, max: 50 });

		expect(
			isRedisMigrationCacheStale({
				cachedAt: 1000,
				customerId,
				redisConfig: makeConfig({
					migrationPercent: 50,
					previousMigrationPercent: 0,
					migrationChangedAt: 1000,
				}),
			}),
		).toBe(false);
	});

	test("keeps legacy entries without cachedAt fresh", () => {
		expect(
			isRedisMigrationCacheStale({
				cachedAt: undefined,
				customerId: "cus_legacy",
				redisConfig: makeConfig(),
			}),
		).toBe(false);
	});

	test("keeps cache fresh without a redis config or customer ID", () => {
		expect(
			isRedisMigrationCacheStale({
				cachedAt: 500,
				customerId: "cus_1",
				redisConfig: null,
			}),
		).toBe(false);
		expect(
			isRedisMigrationCacheStale({
				cachedAt: 500,
				customerId: undefined,
				redisConfig: makeConfig(),
			}),
		).toBe(false);
	});
});
