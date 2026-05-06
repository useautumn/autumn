import { describe, expect, test } from "bun:test";
import type { Organization, OrgRedisConfig } from "@autumn/shared";
import {
	getCustomerBucket,
	getCustomerRedisRoutingId,
	getCustomerRedisRoutingInfoForOrg,
} from "@/external/redis/customerRedisRoutingInfo.js";

const makeRedisConfig = (
	overrides: Partial<OrgRedisConfig> = {},
): OrgRedisConfig => ({
	connectionString: "encrypted",
	url: "dragonfly.internal:6379",
	migrationPercent: 50,
	previousMigrationPercent: 0,
	migrationChangedAt: 1000,
	...overrides,
});

const makeOrg = ({
	redisConfig = makeRedisConfig(),
}: {
	redisConfig?: OrgRedisConfig | null;
}) =>
	({
		id: "org_test",
		redis_config: redisConfig,
	}) as Organization;

const findCustomerInBucketRange = ({
	min,
	max,
}: {
	min: number;
	max: number;
}): string => {
	for (let index = 0; index < 10_000; index++) {
		const customerId = `cus_routing_${index}`;
		const bucket = getCustomerBucket(customerId);
		if (bucket >= min && bucket < max) return customerId;
	}
	throw new Error(`No customer found in bucket range [${min}, ${max})`);
};

describe("customer Redis routing", () => {
	test("uses the public customer ID as the routing ID when present", () => {
		expect(
			getCustomerRedisRoutingId({
				customer: {
					id: "cus_public",
					internal_id: "cus_internal",
				},
			}),
		).toBe("cus_public");
	});

	test("falls back to internal ID for customers without a public ID", () => {
		expect(
			getCustomerRedisRoutingId({
				customer: {
					id: null,
					internal_id: "cus_internal",
				},
			}),
		).toBe("cus_internal");
	});

	test("assigns a deterministic bucket from 0 to 99", () => {
		const bucket = getCustomerBucket("cus_abc123");

		expect(bucket).toBe(getCustomerBucket("cus_abc123"));
		expect(bucket).toBeGreaterThanOrEqual(0);
		expect(bucket).toBeLessThan(100);
	});

	test("uses shared Redis when the org has no redis_config", () => {
		const org = makeOrg({ redisConfig: null });

		expect(
			getCustomerRedisRoutingInfoForOrg({
				org,
				customerId: "cus_1",
			}),
		).toEqual({
			usesDedicatedRedis: false,
		});
	});

	test("uses shared Redis when customerId is missing", () => {
		const org = makeOrg({
			redisConfig: makeRedisConfig({ migrationPercent: 100 }),
		});

		expect(
			getCustomerRedisRoutingInfoForOrg({
				org,
			}).redisUrl,
		).toBeUndefined();
	});

	test("routes buckets below migrationPercent to dedicated Dragonfly", () => {
		const config = makeRedisConfig({ migrationPercent: 50 });
		const org = makeOrg({ redisConfig: config });
		const customerId = findCustomerInBucketRange({ min: 0, max: 50 });

		expect(
			getCustomerRedisRoutingInfoForOrg({
				org,
				customerId,
			}).redisUrl,
		).toBe(config.url);
		expect(
			getCustomerRedisRoutingInfoForOrg({
				org,
				customerId,
			}),
		).toMatchObject({
			redisUrl: config.url,
			usesDedicatedRedis: true,
		});
	});

	test("keeps buckets at or above migrationPercent on shared Redis", () => {
		const org = makeOrg({
			redisConfig: makeRedisConfig({ migrationPercent: 50 }),
		});
		const customerId = findCustomerInBucketRange({ min: 50, max: 100 });

		expect(
			getCustomerRedisRoutingInfoForOrg({
				org,
				customerId,
			}).redisUrl,
		).toBeUndefined();
		expect(
			getCustomerRedisRoutingInfoForOrg({
				org,
				customerId,
			}),
		).toMatchObject({
			usesDedicatedRedis: false,
		});
	});
});
