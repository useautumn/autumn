import { afterAll, describe, expect, mock, test } from "bun:test";
import { type AppEnv, type Feature, withTimeout } from "@autumn/shared";
import type { Redis } from "ioredis";
import { BATCH_MIGRATION_DEFERRED_OPERATION_TIMEOUT_MS } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";

// The freshness mark is a real Postgres write; keep this suite hermetic.
const marksModulePath =
	"@/internal/customers/customerLsns/markCustomerUpdatedAt.js";
const realMarks = { ...(await import(marksModulePath)) };
mock.module(marksModulePath, () => ({
	...realMarks,
	markCustomersUpdatedAt: async () => {},
}));
// The worker evict is a Kafka append; capture it instead.
const evictsModulePath =
	"@/internal/balances/balanceWorker/queueBalanceWorkerEvicts.js";
const realEvicts = { ...(await import(evictsModulePath)) };
const queuedEvicts: { customerId: string }[][] = [];
mock.module(evictsModulePath, () => ({
	...realEvicts,
	queueBalanceWorkerEvicts: async ({
		customers,
	}: {
		customers: { customerId: string }[];
	}) => {
		queuedEvicts.push(customers);
	},
}));
afterAll(() => {
	mock.module(marksModulePath, () => realMarks);
	mock.module(evictsModulePath, () => realEvicts);
});

const { batchInvalidateCachedFullSubjects } = await import(
	"@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects.js"
);

import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";
import { buildFullSubjectOrgEnvKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectOrgEnvKey.js";

type RedisCalls = {
	readKeys: string[];
	writeOps: string[];
	readBatchSizes: number[];
	writeBatchSizes: number[];
};

const createFakeRedis = ({
	status = "ready",
	readFails = false,
	failWrites = 0,
	errorTupleWrites = 0,
	commandErrorWrites = 0,
	pipelineDelayMs = 0,
}: {
	status?: string;
	readFails?: boolean;
	/** Number of leading write-pipeline execs that reject before one succeeds. */
	failWrites?: number;
	/** Number of write execs after that which resolve with a dead-socket tuple. */
	errorTupleWrites?: number;
	/** Number of write execs after that which resolve with a command error tuple. */
	commandErrorWrites?: number;
	pipelineDelayMs?: number;
} = {}): { redis: Redis; calls: RedisCalls & { writeAttempts: number } } => {
	const calls = {
		readKeys: [] as string[],
		writeOps: [] as string[],
		readBatchSizes: [] as number[],
		writeBatchSizes: [] as number[],
		writeAttempts: 0,
	};
	const redis = {
		status,
		pipeline: () => {
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
				// Retries mean writes aren't a fixed nth pipeline — discriminate on
				// the commands actually queued.
				exec: async () => {
					if (pipelineDelayMs) await Bun.sleep(pipelineDelayMs);
					if (writeOps.length === 0) {
						calls.readBatchSizes.push(readKeys.length);
						if (readFails) throw new Error("Command timed out");
						calls.readKeys.push(...readKeys);
						return readKeys.map(() => [
							null,
							JSON.stringify({ meteredFeatures: ["feature_metered"] }),
						]);
					}

					calls.writeAttempts++;
					calls.writeBatchSizes.push(writeOps.length);
					if (calls.writeAttempts <= failWrites) {
						throw new Error("Command timed out");
					}
					if (calls.writeAttempts <= failWrites + errorTupleWrites) {
						return [[new Error("Command timed out"), null]];
					}
					if (
						calls.writeAttempts <=
						failWrites + errorTupleWrites + commandErrorWrites
					) {
						return [
							[null, 1],
							[
								new Error(
									"OOM command not allowed when used memory > 'maxmemory'",
								),
								null,
							],
						];
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
	test.each([1_000, 4_000, 9_000])(
		"measures the full-page cache deadline at %i ms per pipeline",
		async (pipelineLatencyMs) => {
			const timeScale = 100;
			const primary = createFakeRedis({
				pipelineDelayMs: pipelineLatencyMs / timeScale,
			});
			const customers = Array.from({ length: 5_000 }, (_, index) => ({
				orgId: "org_test",
				env: "sandbox" as AppEnv,
				customerId: `cus_${index}`,
			}));
			const invalidation = batchInvalidateCachedFullSubjects({
				customers,
				featuresByOrgEnv: {},
				getRedisTargetsForCustomer: () => [primary.redis],
				maxAttempts: 5,
				throwWhenExhausted: true,
			});
			const bounded = withTimeout({
				fn: () => invalidation,
				timeoutMs: BATCH_MIGRATION_DEFERRED_OPERATION_TIMEOUT_MS / timeScale,
				timeoutMessage: "cache deadline exceeded",
			});
			if (pipelineLatencyMs === 9_000) {
				await expect(bounded).rejects.toThrow("cache deadline exceeded");
				expect(primary.calls.readKeys.length).toBeLessThan(5_000);
			} else {
				expect(await bounded).toBe(5_000);
			}
			// A Promise.race timeout doesn't cancel the remaining Redis batches.
			expect(await invalidation).toBe(5_000);
			expect(primary.calls.readBatchSizes).toEqual(Array(20).fill(250));
			expect(primary.calls.writeBatchSizes).toEqual(Array(20).fill(1_000));
			expect(new Set(primary.calls.writeOps).size).toBe(20_000);
		},
	);

	test("queues one worker evict batch for the page, before any Redis write", async () => {
		queuedEvicts.length = 0;
		const primary = createFakeRedis();
		const customers = ["cus_1", "cus_2"].map((customerId) => ({
			orgId: "org_test",
			env: "sandbox" as AppEnv,
			customerId,
		}));
		await batchInvalidateCachedFullSubjects({
			customers,
			featuresByOrgEnv: {},
			getRedisTargetsForCustomer: () => [primary.redis],
		});
		expect(queuedEvicts).toEqual([customers]);
	});

	test("limits migration pipelines to 250 subjects and retries the same batch", async () => {
		const primary = createFakeRedis({ errorTupleWrites: 1 });
		const dedicated = createFakeRedis();
		const customers = Array.from({ length: 501 }, (_, index) => ({
			orgId: "org_test",
			env: "sandbox" as AppEnv,
			customerId: `cus_${index}`,
		}));

		const invalidated = await batchInvalidateCachedFullSubjects({
			customers,
			featuresByOrgEnv: {},
			getRedisTargetsForCustomer: () => [primary.redis, dedicated.redis],
			maxAttempts: 2,
			throwWhenExhausted: true,
		});

		expect(invalidated).toBe(501);
		for (const target of [primary, dedicated]) {
			expect(target.calls.readBatchSizes).toEqual([250, 250, 1]);
			expect(target.calls.readKeys).toHaveLength(501);
			expect(target.calls.writeOps).toHaveLength(501 * 4);
			expect(new Set(target.calls.writeOps).size).toBe(501 * 4);
		}
		expect(primary.calls.writeBatchSizes).toEqual([1000, 1000, 1000, 4]);
		expect(dedicated.calls.writeBatchSizes).toEqual([1000, 1000, 4]);
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

	/**
	 * A dedicated org Redis is created lazily on first use, so inside a fresh
	 * trigger.dev batch-migration runner it is still "connecting" when finalize
	 * invalidates. Dropping the invalidation there leaves every migrated
	 * customer on that org reading a stale FullSubject until the 3-day TTL.
	 */
	test("still invalidates when the target Redis is not ready yet", async () => {
		const connecting = createFakeRedis({ status: "connecting" });
		const customer = {
			orgId: "org_test",
			env: "sandbox" as AppEnv,
			customerId: "cus_cold_connection",
		};

		await batchInvalidateCachedFullSubjects({
			customers: [customer],
			featuresByOrgEnv: {
				[buildFullSubjectOrgEnvKey({
					orgId: customer.orgId,
					env: customer.env,
				})]: [{ id: "feature_metered" }] as Feature[],
			},
			getRedisTargetsForCustomer: () => [connecting.redis],
		});

		expect(connecting.calls.writeOps).toContain(
			`unlink:${buildFullSubjectKey({
				orgId: customer.orgId,
				env: customer.env,
				customerId: customer.customerId,
			})}`,
		);
		expect(connecting.calls.writeOps.some((op) => op.startsWith("incr:"))).toBe(
			true,
		);
		expect(
			connecting.calls.writeOps.some((op) => op.includes("feature_metered")),
		).toBe(true);
	});

	test("falls back to org features when the manifest read is unavailable", async () => {
		const readBroken = createFakeRedis({ readFails: true });
		const customer = {
			orgId: "org_test",
			env: "sandbox" as AppEnv,
			customerId: "cus_read_broken",
		};

		await batchInvalidateCachedFullSubjects({
			customers: [customer],
			featuresByOrgEnv: {
				[buildFullSubjectOrgEnvKey({
					orgId: customer.orgId,
					env: customer.env,
				})]: [{ id: "feature_metered" }] as Feature[],
			},
			getRedisTargetsForCustomer: () => [readBroken.redis],
		});

		expect(
			readBroken.calls.writeOps.some((op) => op.includes("cus_read_broken")),
		).toBe(true);
		expect(
			readBroken.calls.writeOps.some((op) => op.includes("feature_metered")),
		).toBe(true);
	});

	test("retries the invalidation pipeline until it lands", async () => {
		const flaky = createFakeRedis({ failWrites: 2 });
		const customer = {
			orgId: "org_test",
			env: "sandbox" as AppEnv,
			customerId: "cus_flaky",
		};

		await batchInvalidateCachedFullSubjects({
			customers: [customer],
			featuresByOrgEnv: {},
			getRedisTargetsForCustomer: () => [flaky.redis],
			maxAttempts: 5,
		});

		expect(flaky.calls.writeAttempts).toBe(3);
		expect(flaky.calls.writeOps.some((op) => op.includes("cus_flaky"))).toBe(
			true,
		);
	});

	test("treats a pipeline that resolves with dead-socket tuples as a failed attempt", async () => {
		const flaky = createFakeRedis({ errorTupleWrites: 1 });
		const phases: Record<string, number> = {};

		const invalidated = await batchInvalidateCachedFullSubjects({
			customers: [
				{
					orgId: "org_test",
					env: "sandbox" as AppEnv,
					customerId: "cus_tuple",
				},
			],
			featuresByOrgEnv: {},
			getRedisTargetsForCustomer: () => [flaky.redis],
			maxAttempts: 3,
			phases,
		});

		expect(invalidated).toBe(1);
		expect(flaky.calls.writeAttempts).toBe(2);
		expect(flaky.calls.writeOps.some((op) => op.includes("cus_tuple"))).toBe(
			true,
		);
		expect(phases.invalidate_marks_db).toBeGreaterThanOrEqual(0);
		expect(phases.invalidate_redis).toBeGreaterThanOrEqual(0);
	});

	test("gives up without throwing once attempts are exhausted", async () => {
		const down = createFakeRedis({ failWrites: Number.POSITIVE_INFINITY });
		const customer = {
			orgId: "org_test",
			env: "sandbox" as AppEnv,
			customerId: "cus_down",
		};

		const invalidated = await batchInvalidateCachedFullSubjects({
			customers: [customer],
			featuresByOrgEnv: {},
			getRedisTargetsForCustomer: () => [down.redis],
			maxAttempts: 3,
		});

		expect(invalidated).toBe(1);
		expect(down.calls.writeAttempts).toBe(3);
		expect(down.calls.writeOps).toHaveLength(0);
	});

	test("in strict mode a failed command is a failed attempt; best-effort callers keep the tuple", async () => {
		const strictRedis = createFakeRedis({ commandErrorWrites: 1 });
		const invalidated = await batchInvalidateCachedFullSubjects({
			customers: [
				{ orgId: "org_test", env: "sandbox" as AppEnv, customerId: "cus_oom" },
			],
			featuresByOrgEnv: {},
			getRedisTargetsForCustomer: () => [strictRedis.redis],
			maxAttempts: 3,
			throwWhenExhausted: true,
		});
		expect(invalidated).toBe(1);
		expect(strictRedis.calls.writeAttempts).toBe(2);

		const alwaysOom = createFakeRedis({
			commandErrorWrites: Number.POSITIVE_INFINITY,
		});
		await expect(
			batchInvalidateCachedFullSubjects({
				customers: [
					{
						orgId: "org_test",
						env: "sandbox" as AppEnv,
						customerId: "cus_oom",
					},
				],
				featuresByOrgEnv: {},
				getRedisTargetsForCustomer: () => [alwaysOom.redis],
				maxAttempts: 2,
				throwWhenExhausted: true,
			}),
		).rejects.toThrow("dropped 1 of 1 subjects after 2 attempts");

		const bestEffort = createFakeRedis({ commandErrorWrites: 1 });
		await batchInvalidateCachedFullSubjects({
			customers: [
				{ orgId: "org_test", env: "sandbox" as AppEnv, customerId: "cus_oom" },
			],
			featuresByOrgEnv: {},
			getRedisTargetsForCustomer: () => [bestEffort.redis],
			maxAttempts: 3,
		});
		expect(bestEffort.calls.writeAttempts).toBe(1);
	});

	test("rejects instead of failing open when asked to and every attempt is spent", async () => {
		const down = createFakeRedis({ failWrites: Number.POSITIVE_INFINITY });

		await expect(
			batchInvalidateCachedFullSubjects({
				customers: [
					{
						orgId: "org_test",
						env: "sandbox" as AppEnv,
						customerId: "cus_down",
					},
				],
				featuresByOrgEnv: {},
				getRedisTargetsForCustomer: () => [down.redis],
				maxAttempts: 2,
				throwWhenExhausted: true,
			}),
		).rejects.toThrow("dropped 1 of 1 subjects after 2 attempts");
		expect(down.calls.writeAttempts).toBe(2);
	});

	test("defaults to a single attempt for best-effort callers", async () => {
		const down = createFakeRedis({ failWrites: Number.POSITIVE_INFINITY });

		await batchInvalidateCachedFullSubjects({
			customers: [
				{
					orgId: "org_test",
					env: "sandbox" as AppEnv,
					customerId: "cus_best_effort",
				},
			],
			featuresByOrgEnv: {},
			getRedisTargetsForCustomer: () => [down.redis],
		});

		expect(down.calls.writeAttempts).toBe(1);
	});
});
