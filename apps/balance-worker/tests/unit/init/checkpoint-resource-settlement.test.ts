import { expect, test } from "bun:test";
import { Kafka } from "kafkajs";
import { startWorker } from "../../../src/init/lifecycle/startWorker.js";
import { stopWorker } from "../../../src/init/lifecycle/stopWorker.js";
import type { WorkerLifecycleContext } from "../../../src/init/types/balanceWorker.js";
import type { BalanceWorkerState } from "../../../src/init/types/balanceWorkerState.js";
import { createWorkerResources } from "../../../src/init/workerResources.js";
import {
	closeStoreFixture,
	createStoreFixture,
	topic,
} from "../kafka/kafka-test-fixtures.js";

test.concurrent(
	"worker settlement waits for checkpoint shutdown before disconnecting and allows repeated calls",
	async () => {
		const fixture = createStoreFixture();
		const gate = Promise.withResolvers<void>();
		const events: string[] = [];
		const resources = createWorkerResources({
			ctx: {
				kafka: new Kafka({ brokers: ["localhost:19092"] }),
				admin: {
					disconnect: async () => {
						events.push("disconnect");
					},
					fetchTopicOffsets: async () => [],
				},
				stateStore: fixture.store,
				partitionResolver: { partitionForIdentity: () => 0 },
				checkpoints: {
					source: { latest: async () => null },
					maintenance: {
						start: () => {
							throw new Error("not used");
						},
					},
					stop: async () => {
						events.push("maintenance-stop");
						await gate.promise;
						events.push("maintenance-settled");
					},
				},
			},
		});
		try {
			const settling = resources.settleResources();
			await Promise.resolve();
			expect(events).toContain("maintenance-stop");
			expect(events).not.toContain("disconnect");
			gate.resolve();
			await settling;
			expect(events).toEqual([
				"maintenance-stop",
				"maintenance-settled",
				"disconnect",
			]);
		} finally {
			gate.resolve();
			await resources.settleResources();
			closeStoreFixture(fixture);
		}
	},
);

test.concurrent.each([false, true])(
	"checkpoint shutdown failure leaves SQLite open, including failed startup=%s",
	async (failStartup) => {
		const fixture = createStoreFixture();
		const events: string[] = [];
		const resources = createWorkerResources({
			ctx: {
				kafka: new Kafka({ brokers: ["localhost:19092"] }),
				admin: {
					disconnect: async () => {
						events.push("disconnect");
					},
					fetchTopicOffsets: async () => [],
				},
				stateStore: fixture.store,
				partitionResolver: { partitionForIdentity: () => 0 },
				checkpoints: {
					source: { latest: async () => null },
					maintenance: {
						start: () => {
							throw new Error("not used");
						},
					},
					stop: async () => {
						events.push("maintenance-stop");
						throw new Error("checkpoint thread did not settle");
					},
				},
			},
		});
		const state: BalanceWorkerState = { status: "created" };
		const ctx: WorkerLifecycleContext = {
			partitions: {
				start: async () => {
					if (failStartup) throw new Error("startup failed");
				},
				stop: async () => {
					events.push("drained");
				},
			},
			listen: () => ({
				stop: () => {
					events.push("listener-stopped");
				},
			}),
			settleResources: resources.settleResources,
			closeStore: () => {
				events.push("sqlite-closed");
				resources.closeStore();
			},
		};
		try {
			if (failStartup)
				await expect(startWorker({ ctx, state })).rejects.toThrow(
					"Worker startup and cleanup failed",
				);
			else {
				await startWorker({ ctx, state });
				await expect(stopWorker({ ctx, state })).rejects.toThrow(
					"did not settle safely",
				);
			}
			expect(events).toContain("maintenance-stop");
			expect(events).toContain("drained");
			expect(events).toContain("listener-stopped");
			expect(events).not.toContain("sqlite-closed");
			expect(fixture.store.readNextOffset({ topic, partition: 0 })).toBe(0n);
		} finally {
			closeStoreFixture(fixture);
		}
	},
);
