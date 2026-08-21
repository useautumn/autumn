import { describe, expect, test } from "bun:test";
import { canonicalSerialize } from "@/internal/metering/fold/canonicalSerialize.js";
import { InMemoryMeteringLog } from "@/internal/metering/log/inMemoryMeteringLog.js";
import { InMemorySnapshotStore } from "@/internal/metering/snapshot/inMemorySnapshotStore.js";
import { PartitionWorker } from "@/internal/metering/worker/partitionWorker.js";
import { generateEvents } from "./metering-test-fixtures.js";

const EVENT_COUNT = 10_000;
const SNAPSHOT_INTERVAL = 100;
const DEDUPE_CAPACITY = 1_000;
const PARTITION = 0;

// 4_999 lands exactly on a snapshot boundary (5_000 events at interval 100);
// the other two stop mid-interval.
const KILL_OFFSETS = [1_337, 4_999, 8_762];

const buildLog = async () => {
	const log = new InMemoryMeteringLog({ partition: PARTITION });
	for (const event of generateEvents({ count: EVENT_COUNT, seed: 42 })) {
		await log.append({ event });
	}
	return log;
};

const newWorker = ({
	log,
	snapshotStore,
}: {
	log: InMemoryMeteringLog;
	snapshotStore: InMemorySnapshotStore;
}) =>
	new PartitionWorker({
		partition: PARTITION,
		log,
		snapshotStore,
		snapshotInterval: SNAPSHOT_INTERVAL,
		dedupeCapacity: DEDUPE_CAPACITY,
	});

describe("crash / restore equivalence", () => {
	test("a restored worker ends byte-identical to an uninterrupted one", async () => {
		const log = await buildLog();

		const uninterrupted = newWorker({
			log,
			snapshotStore: new InMemorySnapshotStore(),
		});
		await uninterrupted.takeOwnership();
		await uninterrupted.consume();
		const expected = canonicalSerialize({ state: uninterrupted.state });

		expect(uninterrupted.offset).toBe(EVENT_COUNT);
		expect(uninterrupted.state.dedupe.ids).toHaveLength(DEDUPE_CAPACITY);
		expect(Object.keys(uninterrupted.state.customers).length).toBeGreaterThan(
			1,
		);
		expect(
			uninterrupted.check({ customerId: "cus_0", featureId: "feature_0" })
				.balance,
		).toBeGreaterThan(0);

		for (const killOffset of KILL_OFFSETS) {
			const snapshotStore = new InMemorySnapshotStore();

			const killed = newWorker({ log, snapshotStore });
			await killed.takeOwnership();
			await killed.consume({ upTo: killOffset });
			expect(killed.offset).toBe(killOffset + 1);

			const restored = newWorker({ log, snapshotStore });
			await restored.takeOwnership();

			const snapshotOffset = restored.offset;
			expect(snapshotOffset).toBeGreaterThan(0);
			expect(snapshotOffset).toBeLessThanOrEqual(killOffset + 1);
			expect(snapshotOffset % SNAPSHOT_INTERVAL).toBe(0);
			expect(restored.epoch).toBe(2);

			await restored.consume();

			expect(restored.offset).toBe(EVENT_COUNT);
			expect(canonicalSerialize({ state: restored.state })).toBe(expected);
		}
	});

	test("the snapshot boundary kill leaves no tail to replay", async () => {
		const log = await buildLog();
		const snapshotStore = new InMemorySnapshotStore();

		const killed = newWorker({ log, snapshotStore });
		await killed.takeOwnership();
		await killed.consume({ upTo: 4_999 });

		const restored = newWorker({ log, snapshotStore });
		await restored.takeOwnership();

		expect(restored.offset).toBe(5_000);
		expect(canonicalSerialize({ state: restored.state })).toBe(
			canonicalSerialize({ state: killed.state }),
		);
	});

	test("a mid-interval kill really does lose the un-snapshotted tail", async () => {
		const log = await buildLog();
		const snapshotStore = new InMemorySnapshotStore();

		const killed = newWorker({ log, snapshotStore });
		await killed.takeOwnership();
		await killed.consume({ upTo: 1_337 });

		const restored = newWorker({ log, snapshotStore });
		await restored.takeOwnership();

		expect(restored.offset).toBe(1_300);
		expect(canonicalSerialize({ state: restored.state })).not.toBe(
			canonicalSerialize({ state: killed.state }),
		);
	});
});
