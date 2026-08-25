import { describe, expect, test } from "bun:test";
import { InMemoryMeteringLog } from "@/internal/metering/log/inMemoryMeteringLog.js";
import { InMemorySnapshotStore } from "@/internal/metering/snapshot/inMemorySnapshotStore.js";
import { PartitionWorker } from "@/internal/metering/worker/partitionWorker.js";

describe("InMemorySnapshotStore.claimEpoch", () => {
	test("starts at 1 for an untouched partition", async () => {
		const store = new InMemorySnapshotStore();

		expect(await store.claimEpoch({ partition: 0 })).toBe(1);
	});

	test("two concurrent claimants on the same partition never get the same epoch", async () => {
		const store = new InMemorySnapshotStore();

		const [a, b] = await Promise.all([
			store.claimEpoch({ partition: 0 }),
			store.claimEpoch({ partition: 0 }),
		]);

		expect(a).not.toBe(b);
		expect(new Set([a, b]).size).toBe(2);
	});

	test("many concurrent claimants on the same partition each get a distinct epoch", async () => {
		const store = new InMemorySnapshotStore();
		const claimantCount = 20;

		const epochs = await Promise.all(
			Array.from({ length: claimantCount }, () =>
				store.claimEpoch({ partition: 0 }),
			),
		);

		expect(new Set(epochs).size).toBe(claimantCount);
	});

	test("claims on different partitions don't interfere", async () => {
		const store = new InMemorySnapshotStore();

		const [p0, p1] = await Promise.all([
			store.claimEpoch({ partition: 0 }),
			store.claimEpoch({ partition: 1 }),
		]);

		expect(p0).toBe(1);
		expect(p1).toBe(1);
	});

	test("a claim above the latest snapshot's epoch is picked up by the next claim", async () => {
		const store = new InMemorySnapshotStore();
		await store.put({ partition: 0, epoch: 1, offset: 10, data: "a" });

		// A claim-only boot: epoch 2 is taken without ever writing a snapshot.
		expect(await store.claimEpoch({ partition: 0 })).toBe(2);

		// The next claimant must skip past the claimed-but-unwritten epoch 2.
		expect(await store.claimEpoch({ partition: 0 })).toBe(3);
	});
});

describe("PartitionWorker.takeOwnership durable claim", () => {
	test("a claim-only boot (no snapshot ever written) yields a higher epoch on the next boot", async () => {
		const log = new InMemoryMeteringLog({ partition: 0 });
		const snapshotStore = new InMemorySnapshotStore();

		const first = new PartitionWorker({ partition: 0, log, snapshotStore });
		await first.takeOwnership();
		// `first` never calls consume(), so no snapshot is ever put() for its claim.

		const second = new PartitionWorker({ partition: 0, log, snapshotStore });
		await second.takeOwnership();

		expect(second.epoch).toBeGreaterThan(first.epoch);
		expect(first.epoch).toBe(1);
		expect(second.epoch).toBe(2);
	});
});
