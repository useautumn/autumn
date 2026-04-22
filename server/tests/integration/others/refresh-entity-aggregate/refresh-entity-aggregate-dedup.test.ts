import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import chalk from "chalk";
import {
	buildRefreshEntityAggregateDedupId,
	type QueueRefreshEntityAggregatePayload,
	REFRESH_ENTITY_AGGREGATE_DEDUP_BUCKET_MS,
	REFRESH_ENTITY_AGGREGATE_SETTLE_BUFFER_MS,
	RefreshEntityAggregateBatchingManager,
} from "@/internal/balances/utils/refreshEntityAggregate/index.js";
import { JobName } from "@/queue/JobName.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createMockQueue = () => {
	const calls: QueueRefreshEntityAggregatePayload[] = [];
	const fn = async (args: QueueRefreshEntityAggregatePayload) => {
		calls.push(structuredClone(args));
	};
	return { fn, calls };
};

const baseArgs = {
	orgId: "org-1",
	env: AppEnv.Sandbox,
	customerId: "cust-1",
	internalFeatureIds: ["if-seats"],
};

describe("buildRefreshEntityAggregateDedupId", () => {
	test(
		`${chalk.yellowBright("dedup-id-1: same bucket → same id")}`,
		() => {
			const t0 = 1_700_000_000_000;
			const a = buildRefreshEntityAggregateDedupId({
				orgId: "org-1",
				env: AppEnv.Sandbox,
				customerId: "cust-1",
				nowMs: t0,
			});
			const b = buildRefreshEntityAggregateDedupId({
				orgId: "org-1",
				env: AppEnv.Sandbox,
				customerId: "cust-1",
				nowMs: t0 + 4999,
			});
			expect(a).toBe(b);
		},
	);

	test(
		`${chalk.yellowBright("dedup-id-2: across bucket boundary → different ids")}`,
		() => {
			const t0 = 1_700_000_000_000;
			const a = buildRefreshEntityAggregateDedupId({
				orgId: "org-1",
				env: AppEnv.Sandbox,
				customerId: "cust-1",
				nowMs: t0,
			});
			const b = buildRefreshEntityAggregateDedupId({
				orgId: "org-1",
				env: AppEnv.Sandbox,
				customerId: "cust-1",
				nowMs: t0 + REFRESH_ENTITY_AGGREGATE_DEDUP_BUCKET_MS,
			});
			expect(a).not.toBe(b);
		},
	);

	test(
		`${chalk.yellowBright("dedup-id-3: different orgs/envs/customers → different ids")}`,
		() => {
			const nowMs = 1_700_000_000_000;
			const ids = new Set([
				buildRefreshEntityAggregateDedupId({
					orgId: "org-1",
					env: AppEnv.Sandbox,
					customerId: "cust-1",
					nowMs,
				}),
				buildRefreshEntityAggregateDedupId({
					orgId: "org-2",
					env: AppEnv.Sandbox,
					customerId: "cust-1",
					nowMs,
				}),
				buildRefreshEntityAggregateDedupId({
					orgId: "org-1",
					env: AppEnv.Live,
					customerId: "cust-1",
					nowMs,
				}),
				buildRefreshEntityAggregateDedupId({
					orgId: "org-1",
					env: AppEnv.Sandbox,
					customerId: "cust-2",
					nowMs,
				}),
			]);
			expect(ids.size).toBe(4);
		},
	);
});

describe("RefreshEntityAggregateBatchingManager", () => {
	test(
		`${chalk.yellowBright("batch-1: rapid schedule() calls in one bucket → 1 enqueue with merged features")}`,
		async () => {
			const { fn, calls } = createMockQueue();
			const manager = new RefreshEntityAggregateBatchingManager({
				addTaskToQueueFn: fn,
				bucketMs: 100,
				settleBufferMs: 20,
			});

			for (let i = 0; i < 20; i++) {
				manager.schedule({
					...baseArgs,
					internalFeatureIds: [`if-${i % 3}`],
				});
			}

			expect(calls.length).toBe(0);

			await wait(200);

			expect(calls.length).toBe(1);
			expect(calls[0].jobName).toBe(JobName.RefreshEntityAggregate);
			expect(calls[0].payload.customerId).toBe(baseArgs.customerId);
			expect(calls[0].payload.internalFeatureIds.sort()).toEqual([
				"if-0",
				"if-1",
				"if-2",
			]);
			expect(calls[0].messageGroupId).toBe(
				`refresh-agg:${baseArgs.orgId}:${baseArgs.env}:${baseArgs.customerId}`,
			);
		},
		{ timeout: 5_000 },
	);

	test(
		`${chalk.yellowBright("batch-2: schedules across a bucket boundary → 2 enqueues")}`,
		async () => {
			const { fn, calls } = createMockQueue();
			const manager = new RefreshEntityAggregateBatchingManager({
				addTaskToQueueFn: fn,
				bucketMs: 100,
				settleBufferMs: 20,
			});

			manager.schedule(baseArgs);
			await wait(180);
			manager.schedule(baseArgs);
			await wait(180);

			expect(calls.length).toBe(2);
			expect(calls[0].messageDeduplicationId).not.toBe(
				calls[1].messageDeduplicationId,
			);
		},
		{ timeout: 5_000 },
	);

	test(
		`${chalk.yellowBright("batch-3: different customers fire independently")}`,
		async () => {
			const { fn, calls } = createMockQueue();
			const manager = new RefreshEntityAggregateBatchingManager({
				addTaskToQueueFn: fn,
				bucketMs: 100,
				settleBufferMs: 20,
			});

			manager.schedule({ ...baseArgs, customerId: "cust-A" });
			manager.schedule({ ...baseArgs, customerId: "cust-B" });

			expect(manager.getStats().totalPending).toBe(2);

			await wait(200);

			expect(calls.length).toBe(2);
			const customerIds = calls.map((c) => c.payload.customerId).sort();
			expect(customerIds).toEqual(["cust-A", "cust-B"]);
		},
		{ timeout: 5_000 },
	);

	test(
		`${chalk.yellowBright("batch-4: flush() drains all pending immediately")}`,
		async () => {
			const { fn, calls } = createMockQueue();
			const manager = new RefreshEntityAggregateBatchingManager({
				addTaskToQueueFn: fn,
				bucketMs: 10_000, // Will never fire naturally
				settleBufferMs: 1000,
			});

			manager.schedule({ ...baseArgs, customerId: "cust-A" });
			manager.schedule({ ...baseArgs, customerId: "cust-B" });

			expect(calls.length).toBe(0);

			await manager.flush();

			expect(calls.length).toBe(2);
			expect(manager.getStats().totalPending).toBe(0);
		},
		{ timeout: 5_000 },
	);

	test(
		`${chalk.yellowBright("batch-5: settle buffer honored")}`,
		() => {
			expect(REFRESH_ENTITY_AGGREGATE_DEDUP_BUCKET_MS).toBe(5000);
			expect(REFRESH_ENTITY_AGGREGATE_SETTLE_BUFFER_MS).toBe(1500);
		},
	);
});
