/**
 * Regression coverage for deferred SQS producers racing accumulator shutdown.
 *
 * Red failures:
 * - accumulator shutdown starts as soon as one concurrent producer rejects;
 * - max-size sync batches are removed from the pending map without being tracked;
 * - background event enqueue failures are silently consumed by tracking cleanup.
 *
 * Green criteria:
 * - all producer drains settle before accumulator shutdown;
 * - every started sync enqueue remains visible to flush();
 * - background event failures are emitted through the application logger.
 */

import { describe, expect, spyOn, test } from "bun:test";
import { AppEnv, type EventInsert } from "@autumn/shared";
import { logger } from "@/external/logtail/logtailUtils.js";
import { EventBatchingManager } from "@/internal/balances/events/EventBatchingManager.js";
import {
	type QueueRefreshEntityAggregatePayload,
	RefreshEntityAggregateBatchingManager,
} from "@/internal/balances/utils/refreshEntityAggregate/RefreshEntityAggregateBatchingManager.js";
import {
	type QueueSyncV4Payload,
	SyncBatchingManagerV3,
} from "@/internal/balances/utils/sync/SyncBatchingManagerV3.js";
import { shutdownSqsProducers } from "@/queue/shutdownSqsProducers.js";

describe("deferred SQS producer shutdown", () => {
	test("waits for every producer to settle before shutting down accumulators", async () => {
		const producerFailure = new Error("event producer failed");
		let releaseSlowProducer: () => void = () => undefined;
		const slowProducerReleased = new Promise<void>((resolve) => {
			releaseSlowProducer = resolve;
		});
		let accumulatorShutdownStarted = false;

		const shutdown = shutdownSqsProducers({
			producers: [
				{ flush: async () => Promise.reject(producerFailure) },
				{ flush: async () => slowProducerReleased },
			],
			shutdownSqsSendBatchersFn: async () => {
				accumulatorShutdownStarted = true;
			},
		}).catch((error: unknown) => error);

		await Bun.sleep(5);
		expect(accumulatorShutdownStarted).toBeFalse();

		releaseSlowProducer();
		expect(await shutdown).toBe(producerFailure);
		expect(accumulatorShutdownStarted).toBeTrue();
	});

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

	test("sync flush waits for an enqueue started by the max-size path", async () => {
		let markEnqueueStarted: () => void = () => undefined;
		const enqueueStarted = new Promise<void>((resolve) => {
			markEnqueueStarted = resolve;
		});
		let releaseEnqueue: () => void = () => undefined;
		const enqueueReleased = new Promise<void>((resolve) => {
			releaseEnqueue = resolve;
		});
		const manager = new SyncBatchingManagerV3({
			batchWindowMs: 60_000,
			addTaskToQueueFn: async (_args: QueueSyncV4Payload) => {
				markEnqueueStarted();
				await enqueueReleased;
			},
		});
		const entitlementIds = Array.from(
			{ length: 1000 },
			(_, index) => `entitlement_${index}`,
		);

		manager.addSyncItem({
			customerId: "customer_max_size",
			orgId: "org_1",
			env: AppEnv.Live,
			cusEntIds: entitlementIds,
			modifiedCusEntIdsByFeatureId: { messages: entitlementIds },
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

	test("logs background event enqueue failures", async () => {
		const enqueueFailure = new Error("SQS unavailable");
		let markFailureLogged: (args: unknown[]) => void = () => undefined;
		const failureLogged = new Promise<unknown[]>((resolve) => {
			markFailureLogged = resolve;
		});
		const errorSpy = spyOn(logger, "error").mockImplementation((...args) => {
			if (args[0] === "[EventBatchingManager] Failed to execute batch") {
				markFailureLogged(args);
			}
		});
		const manager = new EventBatchingManager({
			batchWindowMs: 0,
			addTaskToQueueFn: async () => Promise.reject(enqueueFailure),
		});
		const event: EventInsert = {
			id: "event_1",
			org_id: "org_1",
			org_slug: "test-org",
			env: AppEnv.Live,
			customer_id: "customer_1",
			event_name: "messages",
		};

		try {
			manager.addEvent(event);
			const loggedArgs = await Promise.race([
				failureLogged,
				Bun.sleep(50).then(() => null),
			]);

			expect(loggedArgs).not.toBeNull();
			expect(loggedArgs?.[1]).toEqual({ error: enqueueFailure });
		} finally {
			errorSpy.mockRestore();
		}
	});
});
