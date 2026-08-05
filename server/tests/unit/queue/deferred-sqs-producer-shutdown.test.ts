/** Regression coverage for deferred SQS producers racing accumulator shutdown. */

import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	type QueueRefreshEntityAggregatePayload,
	RefreshEntityAggregateBatchingManager,
} from "@/internal/balances/utils/refreshEntityAggregate/RefreshEntityAggregateBatchingManager.js";
import {
	type QueueSyncV4Payload,
	SyncBatchingManagerV3,
} from "@/internal/balances/utils/sync/SyncBatchingManagerV3.js";

describe("deferred SQS producer shutdown", () => {
	test("sync flush waits for an enqueue already started by its timer", async () => {
		let markEnqueueStarted: () => void = () => undefined;
		const enqueueStarted = new Promise<void>((resolve) => {
			markEnqueueStarted = resolve;
		});
		let releaseEnqueue: () => void = () => undefined;
		const enqueueReleased = new Promise<void>((resolve) => {
			releaseEnqueue = resolve;
		});
		const manager = new SyncBatchingManagerV3({
			batchWindowMs: 0,
			addTaskToQueueFn: async (_args: QueueSyncV4Payload) => {
				markEnqueueStarted();
				await enqueueReleased;
			},
		});

		manager.addSyncItem({
			customerId: "customer_1",
			orgId: "org_1",
			env: AppEnv.Live,
			cusEntIds: ["entitlement_1"],
			modifiedCusEntIdsByFeatureId: {
				messages: ["entitlement_1"],
			},
		});
		await enqueueStarted;

		let flushResolved = false;
		const flush = manager.flush().then(() => {
			flushResolved = true;
		});

		try {
			await Bun.sleep(5);
			expect(flushResolved).toBeFalse();
		} finally {
			releaseEnqueue();
			await flush;
		}
	});

	test("aggregate refresh flush waits for an enqueue already started by its timer", async () => {
		let markEnqueueStarted: () => void = () => undefined;
		const enqueueStarted = new Promise<void>((resolve) => {
			markEnqueueStarted = resolve;
		});
		let releaseEnqueue: () => void = () => undefined;
		const enqueueReleased = new Promise<void>((resolve) => {
			releaseEnqueue = resolve;
		});
		const manager = new RefreshEntityAggregateBatchingManager({
			bucketMs: 1,
			settleBufferMs: 0,
			now: () => 0,
			addTaskToQueueFn: async (_args: QueueRefreshEntityAggregatePayload) => {
				markEnqueueStarted();
				await enqueueReleased;
			},
		});

		manager.schedule({
			customerId: "customer_1",
			orgId: "org_1",
			env: AppEnv.Live,
			internalFeatureIds: ["feature_1"],
		});
		await enqueueStarted;

		let flushResolved = false;
		const flush = manager.flush().then(() => {
			flushResolved = true;
		});

		try {
			await Bun.sleep(5);
			expect(flushResolved).toBeFalse();
		} finally {
			releaseEnqueue();
			await flush;
		}
	});
});
