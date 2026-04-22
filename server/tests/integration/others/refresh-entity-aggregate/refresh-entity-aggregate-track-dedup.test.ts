/**
 * Verifies that 20 concurrent tracks spread across ~3 seconds result in
 * exactly ONE `RefreshEntityAggregate` enqueue to SQS at the end of the
 * bucket, thanks to the producer-side `RefreshEntityAggregateBatchingManager`.
 */

import { expect, mock, test } from "bun:test";
import chalk from "chalk";

type QueueCall = {
	jobName: string;
	payload: Record<string, unknown>;
	messageGroupId?: string;
	messageDeduplicationId?: string;
};

const queueCalls: QueueCall[] = [];

mock.module("@/queue/queueUtils.js", () => ({
	addTaskToQueue: async (args: QueueCall) => {
		queueCalls.push(structuredClone(args));
	},
}));

const { JobName } = await import("@/queue/JobName.js");
const { TestFeature } = await import("@tests/setup/v2Features.js");
const { items } = await import("@tests/utils/fixtures/items.js");
const { products } = await import("@tests/utils/fixtures/products.js");
const { timeout } = await import("@tests/utils/genUtils.js");
const { initScenario, s } = await import(
	"@tests/utils/testInitUtils/initScenario.js"
);
const { globalRefreshEntityAggregateBatchingManager } = await import(
	"@/internal/balances/utils/refreshEntityAggregate/index.js"
);
const { globalSyncBatchingManagerV3 } = await import(
	"@/internal/balances/utils/sync/SyncBatchingManagerV3.js"
);
const { syncItemV4 } = await import(
	"@/internal/balances/utils/sync/syncItemV4.js"
);

test(
	`${chalk.yellowBright(
		"refresh-dedup-track: 20 concurrent tracks across 3s → exactly 1 RefreshEntityAggregate enqueue",
	)}`,
	async () => {
		const customerId = "refresh-agg-dedup-cus";

		const perEntityMessages = items.monthlyMessages({
			includedUsage: 500,
			entityFeatureId: TestFeature.Users,
		});
		const prod = products.base({
			id: "refresh-agg-dedup",
			items: [perEntityMessages],
		});

		const { autumnV2_1, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [prod] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: prod.id, entityIndex: 0 })],
		});

		// Discard enqueues produced during setup.
		queueCalls.length = 0;

		const trackPromises: Promise<unknown>[] = [];
		for (let i = 0; i < 20; i++) {
			trackPromises.push(
				(async () => {
					await timeout(i * 150); // 20 * 150ms ≈ 3s spread
					return autumnV2_1.track({
						customer_id: customerId,
						entity_id: entities[0].id,
						feature_id: TestFeature.Messages,
						value: 1,
					});
				})(),
			);
		}

		await Promise.all(trackPromises);

		// Drain pending sync batches → SyncBalanceBatchV4 enqueues.
		await globalSyncBatchingManagerV3.flush();

		// Simulate the worker processing each sync-v4 job in this process
		// (there's no live worker inside `bun test`). Each call schedules a
		// refresh with the batching manager.
		const syncJobs = queueCalls.filter(
			(call) => call.jobName === JobName.SyncBalanceBatchV4,
		);
		expect(syncJobs.length).toBeGreaterThanOrEqual(1);

		for (const job of syncJobs) {
			await syncItemV4({
				ctx: ctx as never,
				payload: job.payload as never,
			});
		}

		// Now drain the refresh batching manager — this is what the trailing
		// timer would otherwise do at bucket end + settle buffer. Flushing
		// directly keeps the test fast and deterministic.
		await globalRefreshEntityAggregateBatchingManager.flush();

		const refreshCalls = queueCalls.filter(
			(call) => call.jobName === JobName.RefreshEntityAggregate,
		);

		expect(refreshCalls.length).toBe(1);
		expect(refreshCalls[0].payload).toMatchObject({
			customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(refreshCalls[0].messageGroupId).toBe(
			`refresh-agg:${ctx.org.id}:${ctx.env}:${customerId}`,
		);
	},
	60_000,
);
