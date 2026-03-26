import chalk from "chalk";
import { describe, expect, test } from "bun:test";
import {
	getCustomerBucket,
	getRedisUrlForCustomer,
} from "@/external/redis/customerRedisRouting";
import type { Organization, OrgRedisConfig } from "@autumn/shared";

const makeRedisConfig = (
	overrides: Partial<OrgRedisConfig> = {},
): OrgRedisConfig => ({
	connectionString: "encrypted",
	url: "my-redis.upstash.io",
	migrationPercent: 100,
	previousMigrationPercent: 0,
	migrationChangedAt: 1000,
	...overrides,
});

const makeOrg = (
	redisConfig?: OrgRedisConfig | null,
): Pick<Organization, "id" | "redis_config"> =>
	({
		id: "org_test",
		redis_config: redisConfig ?? null,
	}) as Organization;

/** Finds a customer ID whose bucket falls in the given range [min, max) */
const findCustomerInBucketRange = (min: number, max: number): string => {
	for (let i = 0; i < 10000; i++) {
		const id = `cus_routing_${i}`;
		const bucket = getCustomerBucket(id);
		if (bucket >= min && bucket < max) return id;
	}
	throw new Error(`No customer found in bucket range [${min}, ${max})`);
};

describe(chalk.yellowBright("getCustomerBucket"), () => {
	test("returns a number between 0 and 99", () => {
		for (let i = 0; i < 100; i++) {
			const bucket = getCustomerBucket(`cus_${i}`);
			expect(bucket).toBeGreaterThanOrEqual(0);
			expect(bucket).toBeLessThan(100);
		}
	});

	test("is deterministic — same input always gives same bucket", () => {
		const bucketA = getCustomerBucket("cus_abc123");
		const bucketB = getCustomerBucket("cus_abc123");
		const bucketC = getCustomerBucket("cus_abc123");
		expect(bucketA).toBe(bucketB);
		expect(bucketB).toBe(bucketC);
	});

	test("different customer IDs produce different buckets (mostly)", () => {
		const buckets = new Set<number>();
		for (let i = 0; i < 200; i++) {
			buckets.add(getCustomerBucket(`cus_unique_${i}`));
		}
		expect(buckets.size).toBeGreaterThan(50);
	});

	test("distribution is roughly uniform across 10K customer IDs", () => {
		const counts = new Array(100).fill(0);
		const totalCustomers = 10_000;

		for (let i = 0; i < totalCustomers; i++) {
			const bucket = getCustomerBucket(`cus_distribution_test_${i}`);
			counts[bucket]++;
		}

		const expected = totalCustomers / 100;
		for (let b = 0; b < 100; b++) {
			expect(counts[b]).toBeGreaterThan(expected * 0.5);
			expect(counts[b]).toBeLessThan(expected * 1.5);
		}
	});
});

describe(chalk.yellowBright("getRedisUrlForCustomer (routing logic)"), () => {
	describe(chalk.cyan("no redis_config → master"), () => {
		test("returns undefined when org has no redis_config", () => {
			const org = makeOrg(null);
			expect(
				getRedisUrlForCustomer({ org: org as Organization, customerId: "cus_1" }),
			).toBeUndefined();
		});
	});

	describe(chalk.cyan("no customerId → master"), () => {
		test("returns undefined when customerId is undefined", () => {
			const org = makeOrg(makeRedisConfig({ migrationPercent: 100 }));
			expect(
				getRedisUrlForCustomer({ org: org as Organization, customerId: undefined }),
			).toBeUndefined();
		});

		test("returns undefined when customerId is empty string", () => {
			const org = makeOrg(makeRedisConfig({ migrationPercent: 100 }));
			expect(
				getRedisUrlForCustomer({ org: org as Organization, customerId: "" }),
			).toBeUndefined();
		});
	});

	describe(chalk.cyan("migrationPercent = 0 → all on master"), () => {
		test("returns undefined for any customer", () => {
			const org = makeOrg(makeRedisConfig({ migrationPercent: 0 }));
			const customerLow = findCustomerInBucketRange(0, 10);
			const customerHigh = findCustomerInBucketRange(90, 100);
			expect(
				getRedisUrlForCustomer({ org: org as Organization, customerId: customerLow }),
			).toBeUndefined();
			expect(
				getRedisUrlForCustomer({ org: org as Organization, customerId: customerHigh }),
			).toBeUndefined();
		});
	});

	describe(chalk.cyan("migrationPercent = 100 → all on dedicated"), () => {
		test("returns org Redis URL for any customer", () => {
			const config = makeRedisConfig({ migrationPercent: 100 });
			const org = makeOrg(config);
			const customerLow = findCustomerInBucketRange(0, 10);
			const customerHigh = findCustomerInBucketRange(90, 100);
			expect(
				getRedisUrlForCustomer({ org: org as Organization, customerId: customerLow }),
			).toBe(config.url);
			expect(
				getRedisUrlForCustomer({ org: org as Organization, customerId: customerHigh }),
			).toBe(config.url);
		});
	});

	describe(chalk.cyan("partial migration (50%) → bucket routing"), () => {
		const config = makeRedisConfig({ migrationPercent: 50 });
		const org = makeOrg(config);

		test("customer with bucket < 50 → dedicated Redis", () => {
			const customerId = findCustomerInBucketRange(0, 50);
			expect(
				getRedisUrlForCustomer({ org: org as Organization, customerId }),
			).toBe(config.url);
		});

		test("customer with bucket >= 50 → master Redis", () => {
			const customerId = findCustomerInBucketRange(50, 100);
			expect(
				getRedisUrlForCustomer({ org: org as Organization, customerId }),
			).toBeUndefined();
		});
	});

	describe(chalk.cyan("small migration (1%) → only bucket 0 on dedicated"), () => {
		const config = makeRedisConfig({ migrationPercent: 1 });
		const org = makeOrg(config);

		test("customer with bucket 0 → dedicated", () => {
			const customerId = findCustomerInBucketRange(0, 1);
			expect(
				getRedisUrlForCustomer({ org: org as Organization, customerId }),
			).toBe(config.url);
		});

		test("customer with bucket >= 1 → master", () => {
			const customerId = findCustomerInBucketRange(1, 100);
			expect(
				getRedisUrlForCustomer({ org: org as Organization, customerId }),
			).toBeUndefined();
		});
	});

	describe(chalk.cyan("boundary: migrationPercent = 99"), () => {
		const config = makeRedisConfig({ migrationPercent: 99 });
		const org = makeOrg(config);

		test("customer with bucket < 99 → dedicated", () => {
			const customerId = findCustomerInBucketRange(0, 99);
			expect(
				getRedisUrlForCustomer({ org: org as Organization, customerId }),
			).toBe(config.url);
		});

		test("customer with bucket 99 → master", () => {
			const customerId = findCustomerInBucketRange(99, 100);
			expect(
				getRedisUrlForCustomer({ org: org as Organization, customerId }),
			).toBeUndefined();
		});
	});

	describe(chalk.cyan("negative/over-100 migrationPercent → safe"), () => {
		test("migrationPercent = -10 → all on master", () => {
			const org = makeOrg(makeRedisConfig({ migrationPercent: -10 }));
			const customerId = findCustomerInBucketRange(0, 50);
			expect(
				getRedisUrlForCustomer({ org: org as Organization, customerId }),
			).toBeUndefined();
		});

		test("migrationPercent = 200 → all on dedicated", () => {
			const config = makeRedisConfig({ migrationPercent: 200 });
			const org = makeOrg(config);
			const customerId = findCustomerInBucketRange(50, 100);
			expect(
				getRedisUrlForCustomer({ org: org as Organization, customerId }),
			).toBe(config.url);
		});
	});

	describe(chalk.cyan("routing is deterministic"), () => {
		test("same org + customerId always returns the same result", () => {
			const config = makeRedisConfig({ migrationPercent: 50 });
			const org = makeOrg(config);
			const customerId = findCustomerInBucketRange(0, 50);

			const results = Array.from({ length: 10 }, () =>
				getRedisUrlForCustomer({ org: org as Organization, customerId }),
			);
			for (const result of results) {
				expect(result).toBe(results[0]);
			}
		});
	});
});
