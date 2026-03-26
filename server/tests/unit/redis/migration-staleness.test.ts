import chalk from "chalk";
import { describe, expect, test } from "bun:test";
import {
	getCustomerBucket,
	isCacheStale,
} from "@/external/redis/customerRedisRouting";
import type { OrgRedisConfig } from "@autumn/shared";

const makeConfig = (
	overrides: Partial<OrgRedisConfig> = {},
): OrgRedisConfig => ({
	connectionString: "encrypted",
	url: "my-redis.upstash.io",
	migrationPercent: 50,
	previousMigrationPercent: 0,
	migrationChangedAt: 1000,
	...overrides,
});

/** Finds a customer ID whose bucket falls in the given range [min, max) */
const findCustomerInBucketRange = (min: number, max: number): string => {
	for (let i = 0; i < 10000; i++) {
		const id = `cus_search_${i}`;
		const bucket = getCustomerBucket(id);
		if (bucket >= min && bucket < max) return id;
	}
	throw new Error(`No customer found in bucket range [${min}, ${max})`);
};

describe(chalk.yellowBright("isCacheStale"), () => {
	describe(chalk.cyan("forward migration: 0% -> 50%"), () => {
		const config = makeConfig({
			migrationPercent: 50,
			previousMigrationPercent: 0,
			migrationChangedAt: 1000,
		});

		test("stale: customer moved to dedicated (bucket < 50), cached before migration", () => {
			const customerId = findCustomerInBucketRange(0, 50);
			expect(
				isCacheStale({ cachedAt: 500, customerId, redisConfig: config }),
			).toBe(true);
		});

		test("fresh: customer stayed on master (bucket >= 50), cached before migration", () => {
			const customerId = findCustomerInBucketRange(50, 100);
			expect(
				isCacheStale({ cachedAt: 500, customerId, redisConfig: config }),
			).toBe(false);
		});

		test("fresh: customer moved but cached AFTER migration", () => {
			const customerId = findCustomerInBucketRange(0, 50);
			expect(
				isCacheStale({ cachedAt: 2000, customerId, redisConfig: config }),
			).toBe(false);
		});
	});

	describe(chalk.cyan("rollback: 50% -> 20%"), () => {
		const config = makeConfig({
			migrationPercent: 20,
			previousMigrationPercent: 50,
			migrationChangedAt: 2000,
		});

		test("stale: customer moved back to master (bucket 20-49), cached before rollback", () => {
			const customerId = findCustomerInBucketRange(20, 50);
			expect(
				isCacheStale({ cachedAt: 1500, customerId, redisConfig: config }),
			).toBe(true);
		});

		test("fresh: customer stayed on dedicated (bucket 0-19), cached before rollback", () => {
			const customerId = findCustomerInBucketRange(0, 20);
			expect(
				isCacheStale({ cachedAt: 1500, customerId, redisConfig: config }),
			).toBe(false);
		});

		test("fresh: customer stayed on master (bucket >= 50), cached before rollback", () => {
			const customerId = findCustomerInBucketRange(50, 100);
			expect(
				isCacheStale({ cachedAt: 1500, customerId, redisConfig: config }),
			).toBe(false);
		});
	});

	describe(chalk.cyan("bump forward: 20% -> 50%"), () => {
		const config = makeConfig({
			migrationPercent: 50,
			previousMigrationPercent: 20,
			migrationChangedAt: 3000,
		});

		test("stale: customer newly moved to dedicated (bucket 20-49)", () => {
			const customerId = findCustomerInBucketRange(20, 50);
			expect(
				isCacheStale({ cachedAt: 2500, customerId, redisConfig: config }),
			).toBe(true);
		});

		test("fresh: customer already on dedicated (bucket 0-19), NOT invalidated", () => {
			const customerId = findCustomerInBucketRange(0, 20);
			expect(
				isCacheStale({ cachedAt: 2500, customerId, redisConfig: config }),
			).toBe(false);
		});

		test("fresh: customer stayed on master (bucket >= 50)", () => {
			const customerId = findCustomerInBucketRange(50, 100);
			expect(
				isCacheStale({ cachedAt: 2500, customerId, redisConfig: config }),
			).toBe(false);
		});
	});

	describe(chalk.cyan("full migration: 50% -> 100%"), () => {
		const config = makeConfig({
			migrationPercent: 100,
			previousMigrationPercent: 50,
			migrationChangedAt: 4000,
		});

		test("stale: customer moved to dedicated (bucket 50-99), cached before change", () => {
			const customerId = findCustomerInBucketRange(50, 100);
			expect(
				isCacheStale({ cachedAt: 3500, customerId, redisConfig: config }),
			).toBe(true);
		});

		test("fresh: customer already on dedicated (bucket 0-49)", () => {
			const customerId = findCustomerInBucketRange(0, 50);
			expect(
				isCacheStale({ cachedAt: 3500, customerId, redisConfig: config }),
			).toBe(false);
		});
	});

	describe(chalk.cyan("full rollback: 100% -> 0%"), () => {
		const config = makeConfig({
			migrationPercent: 0,
			previousMigrationPercent: 100,
			migrationChangedAt: 5000,
		});

		test("stale: all customers moved back to master", () => {
			const customerId = findCustomerInBucketRange(0, 100);
			expect(
				isCacheStale({ cachedAt: 4500, customerId, redisConfig: config }),
			).toBe(true);
		});
	});

	describe(chalk.cyan("edge cases"), () => {
		test("no redisConfig: never stale", () => {
			expect(
				isCacheStale({
					cachedAt: 100,
					customerId: "cus_x",
					redisConfig: null,
				}),
			).toBe(false);
		});

		test("no cachedAt (legacy entry): never stale", () => {
			expect(
				isCacheStale({
					cachedAt: undefined,
					customerId: "cus_x",
					redisConfig: makeConfig(),
				}),
			).toBe(false);
		});

		test("no customerId: never stale", () => {
			expect(
				isCacheStale({
					cachedAt: 100,
					customerId: undefined,
					redisConfig: makeConfig(),
				}),
			).toBe(false);
		});

		test("no migrationChangedAt: never stale", () => {
			expect(
				isCacheStale({
					cachedAt: 100,
					customerId: "cus_x",
					redisConfig: makeConfig({ migrationChangedAt: 0 }),
				}),
			).toBe(false);
		});

		test("same percent (no change): never stale", () => {
			expect(
				isCacheStale({
					cachedAt: 100,
					customerId: "cus_x",
					redisConfig: makeConfig({
						migrationPercent: 50,
						previousMigrationPercent: 50,
						migrationChangedAt: 1000,
					}),
				}),
			).toBe(false);
		});

		test("cachedAt exactly at migrationChangedAt boundary: fresh (not stale)", () => {
			const customerId = findCustomerInBucketRange(0, 50);
			expect(
				isCacheStale({
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

		test("cachedAt one ms before migrationChangedAt: stale if routing changed", () => {
			const customerId = findCustomerInBucketRange(0, 50);
			expect(
				isCacheStale({
					cachedAt: 999,
					customerId,
					redisConfig: makeConfig({
						migrationPercent: 50,
						previousMigrationPercent: 0,
						migrationChangedAt: 1000,
					}),
				}),
			).toBe(true);
		});

		test("migrationPercent > 100: treated like full migration", () => {
			const customerId = findCustomerInBucketRange(50, 100);
			expect(
				isCacheStale({
					cachedAt: 500,
					customerId,
					redisConfig: makeConfig({
						migrationPercent: 150,
						previousMigrationPercent: 50,
						migrationChangedAt: 1000,
					}),
				}),
			).toBe(true);
		});

		test("migrationPercent negative: treated like 0%", () => {
			const customerId = findCustomerInBucketRange(0, 50);
			expect(
				isCacheStale({
					cachedAt: 500,
					customerId,
					redisConfig: makeConfig({
						migrationPercent: -10,
						previousMigrationPercent: 50,
						migrationChangedAt: 1000,
					}),
				}),
			).toBe(true);
		});
	});

	describe(chalk.cyan("multi-step sequential migrations"), () => {
		test("0% -> 30% -> 60%: customer in 30-59 range is stale after second step", () => {
			const customerId = findCustomerInBucketRange(30, 60);
			const configAfterSecondStep = makeConfig({
				migrationPercent: 60,
				previousMigrationPercent: 30,
				migrationChangedAt: 3000,
			});
			expect(
				isCacheStale({
					cachedAt: 2500,
					customerId,
					redisConfig: configAfterSecondStep,
				}),
			).toBe(true);
		});

		test("0% -> 30% -> 60%: customer in 0-29 range is fresh after second step (already migrated)", () => {
			const customerId = findCustomerInBucketRange(0, 30);
			const configAfterSecondStep = makeConfig({
				migrationPercent: 60,
				previousMigrationPercent: 30,
				migrationChangedAt: 3000,
			});
			expect(
				isCacheStale({
					cachedAt: 2500,
					customerId,
					redisConfig: configAfterSecondStep,
				}),
			).toBe(false);
		});

		test("0% -> 50% -> 0% (full rollback): customer in 0-49 range is stale", () => {
			const customerId = findCustomerInBucketRange(0, 50);
			const configAfterRollback = makeConfig({
				migrationPercent: 0,
				previousMigrationPercent: 50,
				migrationChangedAt: 4000,
			});
			expect(
				isCacheStale({
					cachedAt: 3500,
					customerId,
					redisConfig: configAfterRollback,
				}),
			).toBe(true);
		});

		test("0% -> 50% -> 0% (full rollback): customer in 50-99 range is fresh (never moved)", () => {
			const customerId = findCustomerInBucketRange(50, 100);
			const configAfterRollback = makeConfig({
				migrationPercent: 0,
				previousMigrationPercent: 50,
				migrationChangedAt: 4000,
			});
			expect(
				isCacheStale({
					cachedAt: 3500,
					customerId,
					redisConfig: configAfterRollback,
				}),
			).toBe(false);
		});

		test("50% -> 100% -> 50% (partial rollback): customer in 50-99 range is stale", () => {
			const customerId = findCustomerInBucketRange(50, 100);
			const configAfterPartialRollback = makeConfig({
				migrationPercent: 50,
				previousMigrationPercent: 100,
				migrationChangedAt: 5000,
			});
			expect(
				isCacheStale({
					cachedAt: 4500,
					customerId,
					redisConfig: configAfterPartialRollback,
				}),
			).toBe(true);
		});

		test("50% -> 100% -> 50% (partial rollback): customer in 0-49 range is fresh (still on dedicated)", () => {
			const customerId = findCustomerInBucketRange(0, 50);
			const configAfterPartialRollback = makeConfig({
				migrationPercent: 50,
				previousMigrationPercent: 100,
				migrationChangedAt: 5000,
			});
			expect(
				isCacheStale({
					cachedAt: 4500,
					customerId,
					redisConfig: configAfterPartialRollback,
				}),
			).toBe(false);
		});
	});
});
