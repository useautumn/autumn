import { afterAll, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { Redis } from "ioredis";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";

const marksModulePath =
	"@/internal/customers/customerLsns/markCustomerUpdatedAt.js";
const evictsModulePath =
	"@/internal/balances/balanceWorker/queueBalanceWorkerEvicts.js";
const routingModulePath = "@/external/redis/customerRedisRouting.js";
const orgServiceModulePath = "@/internal/orgs/OrgService.js";
const realMarks = { ...(await import(marksModulePath)) };
const realEvicts = { ...(await import(evictsModulePath)) };
const realRouting = { ...(await import(routingModulePath)) };
const realOrgService = { ...(await import(orgServiceModulePath)) };

let redisTarget: Redis;
mock.module(marksModulePath, () => ({
	...realMarks,
	markCustomersUpdatedAt: async () => {},
}));
mock.module(evictsModulePath, () => ({
	...realEvicts,
	queueBalanceWorkerEvicts: async () => {},
}));
mock.module(routingModulePath, () => ({
	...realRouting,
	getRedisTargetsForCustomer: () => [redisTarget],
}));
mock.module(orgServiceModulePath, () => ({
	...realOrgService,
	OrgService: {
		...realOrgService.OrgService,
		getWithFeatures: async () => ({
			org: { id: "org_test", config: {} },
			features: [],
		}),
	},
}));
afterAll(() => {
	mock.module(marksModulePath, () => realMarks);
	mock.module(evictsModulePath, () => realEvicts);
	mock.module(routingModulePath, () => realRouting);
	mock.module(orgServiceModulePath, () => realOrgService);
});

const { runClearCreditSystemCacheTask } = await import(
	"@/internal/features/featureActions/runClearCreditSystemCacheTask.js"
);

const customerIds = ["cus_1", "cus_2"];

const createQuery = (rows: unknown[]) => {
	const where = () =>
		Object.assign(Promise.resolve(rows), {
			orderBy: () => ({ limit: async () => rows }),
		});
	const query = {
		from: () => query,
		leftJoin: () => query,
		innerJoin: () => query,
		where,
	};
	return query;
};

const fakeDb = {
	select: () => createQuery([{ count: customerIds.length }]),
	selectDistinct: () =>
		createQuery(
			customerIds.map((customerId) => ({
				customerId,
				internalCustomerId: `internal_${customerId}`,
			})),
		),
} as unknown as DrizzleCli;

const createFlakyRedis = ({ failedWrites }: { failedWrites: number }) => {
	const calls = { writeAttempts: 0, unlinked: [] as string[] };
	const redis = {
		status: "ready",
		pipeline: () => {
			const reads: string[] = [];
			const unlinks: string[] = [];
			const pipeline = {
				get: (key: string) => {
					reads.push(key);
					return pipeline;
				},
				unlink: (key: string) => {
					unlinks.push(key);
					return pipeline;
				},
				incr: () => pipeline,
				expire: () => pipeline,
				exec: async () => {
					if (unlinks.length === 0) return reads.map(() => [null, null]);
					calls.writeAttempts++;
					if (calls.writeAttempts <= failedWrites) {
						throw new Error("Command timed out");
					}
					calls.unlinked.push(...unlinks);
					return [];
				},
			};
			return pipeline;
		},
	} as unknown as Redis;
	return { redis, calls };
};

const runTask = () =>
	runClearCreditSystemCacheTask({
		db: fakeDb,
		payload: {
			orgId: "org_test",
			env: AppEnv.Live,
			internalFeatureId: "fe_credits",
		},
		logger,
	});

describe("runClearCreditSystemCacheTask", () => {
	test("retries a Redis timeout so the batch is still cleared", async () => {
		const flaky = createFlakyRedis({ failedWrites: 1 });
		redisTarget = flaky.redis;

		await runTask();

		expect(flaky.calls.writeAttempts).toBe(2);
		expect(flaky.calls.unlinked).toEqual(
			expect.arrayContaining(
				customerIds.map((customerId) =>
					buildFullSubjectKey({
						orgId: "org_test",
						env: AppEnv.Live,
						customerId,
					}),
				),
			),
		);
	});

	test("bounds retries when Redis keeps timing out", async () => {
		const flaky = createFlakyRedis({ failedWrites: Number.POSITIVE_INFINITY });
		redisTarget = flaky.redis;

		await runTask();

		expect(flaky.calls.writeAttempts).toBe(3);
		expect(flaky.calls.unlinked).toEqual([]);
	});
});
