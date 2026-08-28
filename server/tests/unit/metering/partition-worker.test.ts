import { describe, expect, test } from "bun:test";
import type { MeteringEvent } from "@/internal/metering/events/meteringEventSchema.js";
import { InMemoryMeteringLog } from "@/internal/metering/log/inMemoryMeteringLog.js";
import { InMemorySnapshotStore } from "@/internal/metering/snapshot/inMemorySnapshotStore.js";
import {
	DEFAULT_SNAPSHOT_INTERVAL,
	PartitionWorker,
} from "@/internal/metering/worker/partitionWorker.js";
import { makeEvent } from "./metering-test-fixtures.js";

const seedLog = async ({ events }: { events: MeteringEvent[] }) => {
	const log = new InMemoryMeteringLog({ partition: 0 });
	for (const event of events) await log.append({ event });
	return log;
};

const grantThenDeducts = [
	makeEvent({ id: "evt_1", type: "grant", value: 100 }),
	makeEvent({ id: "evt_2", type: "deduct", value: 40 }),
	makeEvent({ id: "evt_3", type: "deduct", value: 25 }),
	makeEvent({ id: "evt_4", type: "deduct", value: 5 }),
	makeEvent({ id: "evt_5", type: "deduct", value: 10 }),
];

describe("PartitionWorker", () => {
	test("starts at offset 0 and epoch 1 on an empty snapshot store", async () => {
		const worker = new PartitionWorker({
			partition: 0,
			log: await seedLog({ events: [] }),
			snapshotStore: new InMemorySnapshotStore(),
		});
		await worker.takeOwnership();

		expect(worker.offset).toBe(0);
		expect(worker.epoch).toBe(1);
		expect(worker.partition).toBe(0);
	});

	test("captures the startup high watermark and becomes ready only after consuming it", async () => {
		const worker = new PartitionWorker({
			partition: 0,
			log: await seedLog({ events: grantThenDeducts }),
			snapshotStore: new InMemorySnapshotStore(),
		});
		await worker.takeOwnership();

		expect(worker.isReady).toBeFalse();
		expect(await worker.captureHighWatermark()).toBe(5);
		expect(worker.isReady).toBeFalse();

		await worker.consume({ upTo: 1 });
		expect(worker.isReady).toBeFalse();

		await worker.consume();
		expect(worker.isReady).toBeTrue();
	});

	test("ignores a legacy unscoped snapshot and replays from offset zero", async () => {
		const snapshotStore = new InMemorySnapshotStore();
		await snapshotStore.put({
			partition: 0,
			epoch: 1,
			offset: 50,
			data: JSON.stringify({
				customers: {
					cus_1: { messages: { granted: 100, balance: 90 } },
				},
				dedupe: { capacity: 10_000, ids: ["legacy_event"] },
			}),
		});
		const worker = new PartitionWorker({
			partition: 0,
			log: await seedLog({ events: [] }),
			snapshotStore,
		});

		await worker.takeOwnership();

		expect(worker.offset).toBe(0);
		expect(worker.state.customers).toEqual({});
		expect(worker.state.dedupe.ids).toEqual([]);
	});

	test("consume applies events in order and advances the offset", async () => {
		const worker = new PartitionWorker({
			partition: 0,
			log: await seedLog({ events: grantThenDeducts }),
			snapshotStore: new InMemorySnapshotStore(),
		});
		await worker.takeOwnership();

		const { applied, offset } = await worker.consume();

		expect(applied).toBe(5);
		expect(offset).toBe(5);
		expect(
			worker.check({
				orgId: "org_1",
				env: "sandbox",
				customerId: "cus_1",
				featureId: "messages",
			}),
		).toEqual({ balance: 20, allowed: true });
	});

	test("consume resumes from the current offset and is a no-op when drained", async () => {
		const worker = new PartitionWorker({
			partition: 0,
			log: await seedLog({ events: grantThenDeducts }),
			snapshotStore: new InMemorySnapshotStore(),
		});
		await worker.takeOwnership();

		await worker.consume({ upTo: 1 });
		expect(worker.offset).toBe(2);
		expect(
			worker.check({
				orgId: "org_1",
				env: "sandbox",
				customerId: "cus_1",
				featureId: "messages",
			}),
		).toEqual({ balance: 60, allowed: true });

		expect((await worker.consume()).applied).toBe(3);
		expect((await worker.consume()).applied).toBe(0);
		expect(worker.offset).toBe(5);
	});

	test("check reports zero and not allowed for unknown customers and features", async () => {
		const worker = new PartitionWorker({
			partition: 0,
			log: await seedLog({ events: grantThenDeducts }),
			snapshotStore: new InMemorySnapshotStore(),
		});
		await worker.takeOwnership();
		await worker.consume();

		expect(
			worker.check({
				orgId: "org_1",
				env: "sandbox",
				customerId: "nope",
				featureId: "messages",
			}),
		).toEqual({
			balance: 0,
			allowed: false,
		});
		expect(
			worker.check({
				orgId: "org_1",
				env: "sandbox",
				customerId: "cus_1",
				featureId: "nope",
			}),
		).toEqual({ balance: 0, allowed: false });
	});

	test("a drained balance is reported as not allowed", async () => {
		const worker = new PartitionWorker({
			partition: 0,
			log: await seedLog({
				events: [
					makeEvent({ id: "evt_1", type: "grant", value: 10 }),
					makeEvent({ id: "evt_2", type: "deduct", value: 10 }),
				],
			}),
			snapshotStore: new InMemorySnapshotStore(),
		});
		await worker.takeOwnership();
		await worker.consume();

		expect(
			worker.check({
				orgId: "org_1",
				env: "sandbox",
				customerId: "cus_1",
				featureId: "messages",
			}),
		).toEqual({ balance: 0, allowed: false });
	});

	test("snapshots every N consumed events", async () => {
		const snapshotStore = new InMemorySnapshotStore();
		const worker = new PartitionWorker({
			partition: 0,
			log: await seedLog({ events: grantThenDeducts }),
			snapshotStore,
			snapshotInterval: 2,
		});
		await worker.takeOwnership();
		await worker.consume();

		const latest = await snapshotStore.getLatest({ partition: 0 });

		expect(latest?.offset).toBe(4);
		expect(latest?.epoch).toBe(1);
		expect(snapshotStore.count({ partition: 0 })).toBe(2);
	});

	test("the snapshot interval defaults to 1000 events", async () => {
		const snapshotStore = new InMemorySnapshotStore();
		const worker = new PartitionWorker({
			partition: 0,
			log: await seedLog({ events: grantThenDeducts }),
			snapshotStore,
		});
		await worker.takeOwnership();
		await worker.consume();

		expect(DEFAULT_SNAPSHOT_INTERVAL).toBe(1000);
		expect(await snapshotStore.getLatest({ partition: 0 })).toBeNull();
	});

	test("taking ownership bumps the stored epoch", async () => {
		const snapshotStore = new InMemorySnapshotStore();
		const log = await seedLog({ events: grantThenDeducts });

		const first = new PartitionWorker({
			partition: 0,
			log,
			snapshotStore,
			snapshotInterval: 2,
		});
		await first.takeOwnership();
		await first.consume();

		const second = new PartitionWorker({ partition: 0, log, snapshotStore });
		await second.takeOwnership();

		expect(first.epoch).toBe(1);
		expect(second.epoch).toBe(2);
		expect(second.offset).toBe(4);
	});
});
