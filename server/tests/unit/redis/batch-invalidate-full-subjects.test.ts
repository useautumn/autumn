import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AppEnv } from "@autumn/shared";
import type { Redis } from "ioredis";

const mockState = {
	deletedCount: 0,
};

mock.module(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/batchDeleteCachedFullCustomers.js",
	() => ({
		batchDeleteCachedFullCustomers: async ({
			customers,
		}: {
			customers: unknown[];
		}) => {
			mockState.deletedCount = customers.length;
			return customers.length;
		},
	}),
);

mock.module("@/utils/cacheUtils/cacheUtils.js", () => ({
	tryRedisRead: async <T>(operation: () => Promise<T>) => operation(),
	tryRedisWrite: async <T>(operation: () => Promise<T>) => operation(),
}));

import { batchInvalidateCachedFullSubjects } from "@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects.js";

type RedisCalls = {
	readKeys: string[];
	writeOps: string[];
};

const createFakeRedis = (): { redis: Redis; calls: RedisCalls } => {
	const calls: RedisCalls = {
		readKeys: [],
		writeOps: [],
	};
	let pipelineCount = 0;

	const redis = {
		status: "ready",
		pipeline: () => {
			const isReadPipeline = pipelineCount % 2 === 0;
			pipelineCount++;

			const readKeys: string[] = [];
			const writeOps: string[] = [];
			const pipeline = {
				get: (key: string) => {
					readKeys.push(key);
					return pipeline;
				},
				unlink: (key: string) => {
					writeOps.push(`unlink:${key}`);
					return pipeline;
				},
				incr: (key: string) => {
					writeOps.push(`incr:${key}`);
					return pipeline;
				},
				expire: (key: string, ttlSeconds: number) => {
					writeOps.push(`expire:${key}:${ttlSeconds}`);
					return pipeline;
				},
				exec: async () => {
					if (isReadPipeline) {
						calls.readKeys.push(...readKeys);
						return readKeys.map(() => [
							null,
							JSON.stringify({ meteredFeatures: ["feature_metered"] }),
						]);
					}

					calls.writeOps.push(...writeOps);
					return [];
				},
			};

			return pipeline;
		},
	} as unknown as Redis;

	return { redis, calls };
};

describe("batchInvalidateCachedFullSubjects", () => {
	beforeEach(() => {
		mockState.deletedCount = 0;
	});

	test("fans out invalidation to the Redis instance for each customer", async () => {
		const primary = createFakeRedis();
		const dedicated = createFakeRedis();
		const customers = [
			{
				orgId: "org_test",
				env: "sandbox" as AppEnv,
				customerId: "cus_primary",
			},
			{
				orgId: "org_test",
				env: "sandbox" as AppEnv,
				customerId: "cus_dedicated",
			},
		];

		const deleted = await batchInvalidateCachedFullSubjects({
			customers,
			featuresByOrgEnv: {},
			getRedisTargetsForCustomer: ({ customer }) => [
				customer.customerId === "cus_dedicated"
					? dedicated.redis
					: primary.redis,
			],
		});

		expect(deleted).toBe(2);
		expect(mockState.deletedCount).toBe(2);

		expect(primary.calls.readKeys).toHaveLength(1);
		expect(primary.calls.readKeys[0]).toContain("cus_primary");
		expect(primary.calls.readKeys[0]).not.toContain("cus_dedicated");

		expect(dedicated.calls.readKeys).toHaveLength(1);
		expect(dedicated.calls.readKeys[0]).toContain("cus_dedicated");
		expect(dedicated.calls.readKeys[0]).not.toContain("cus_primary");

		expect(
			primary.calls.writeOps.some((op) => op.includes("cus_primary")),
		).toBe(true);
		expect(
			dedicated.calls.writeOps.some((op) => op.includes("cus_dedicated")),
		).toBe(true);
	});

	test("dedupes duplicate Redis targets for the same customer", async () => {
		const primary = createFakeRedis();
		const customers = [
			{
				orgId: "org_test",
				env: "sandbox" as AppEnv,
				customerId: "cus_primary",
			},
		];

		await batchInvalidateCachedFullSubjects({
			customers,
			featuresByOrgEnv: {},
			getRedisTargetsForCustomer: () => [primary.redis, primary.redis],
		});

		expect(primary.calls.readKeys).toHaveLength(1);
		expect(
			primary.calls.writeOps.some((op) => op.includes("cus_primary")),
		).toBe(true);
	});
});

afterAll(() => {
	mock.restore();
});
