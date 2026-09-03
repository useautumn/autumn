import { describe, expect, test } from "bun:test";
import {
	createKafkaPartitionOutcomeFollower,
	type KafkaPartitionControlPort,
	KafkaPartitionFollowerStoppedError,
	StateAheadOfKafkaLogEndError,
} from "../../../src/kafka/kafkaPartitionOutcomeFollower.js";
import { KafkaPartitionPositionTracker } from "../../../src/kafka/kafkaPartitionPositionTracker.js";
import { StateBehindKafkaLogStartError } from "../../../src/kafka/kafkaTrackOutcomeConsumer.js";
import { PartitionProgressNotFoundError } from "../../../src/state/sqliteBalanceStateErrors.js";
import {
	closeStoreFixture,
	createStoreFixture,
	partition,
	topic,
} from "./kafka-test-fixtures.js";

const createPartitionControl = (): KafkaPartitionControlPort & {
	pauses: Array<{ topic: string; partitions?: number[] }>;
	resumes: Array<{ topic: string; partitions?: number[] }>;
	seeks: Array<{ topic: string; partition: number; offset: string }>;
} => {
	const pauses: Array<{ topic: string; partitions?: number[] }> = [];
	const resumes: Array<{ topic: string; partitions?: number[] }> = [];
	const seeks: Array<{ topic: string; partition: number; offset: string }> = [];
	return {
		pauses,
		resumes,
		seeks,
		pause: (topics) => pauses.push(...topics),
		resume: (topics) => resumes.push(...topics),
		seek: (position) => seeks.push(position),
	};
};

const createPartitionOffsets = ({
	low,
	high,
}: {
	low: string;
	high: string;
}) => ({
	fetchTopicOffsets: async () => [{ partition, offset: high, low, high }],
});

describe("Kafka partition outcome follower", () => {
	test("waits for the consumed position captured after ownership fencing", async () => {
		const fixture = createStoreFixture();
		try {
			const consumer = createPartitionControl();
			const positionTracker = new KafkaPartitionPositionTracker();
			const follower = createKafkaPartitionOutcomeFollower({
				consumer,
				partitionOffsets: createPartitionOffsets({ low: "0", high: "5" }),
				stateStore: fixture.store,
				positionTracker,
			});
			let caughtUp = false;
			const catchUp = follower
				.startAndCatchUp({ topic, partition, onUnavailable: () => undefined })
				.then(() => {
					caughtUp = true;
				});

			await Promise.resolve();
			expect(consumer.seeks).toEqual([{ topic, partition, offset: "0" }]);
			expect(consumer.resumes).toEqual([{ topic, partitions: [partition] }]);

			positionTracker.advance({ topic, partition, nextOffset: 4n });
			await Promise.resolve();
			expect(caughtUp).toBe(false);

			positionTracker.advance({ topic, partition, nextOffset: 5n });
			await catchUp;
			expect(caughtUp).toBe(true);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(0n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("is caught up immediately when the partition is empty", async () => {
		const fixture = createStoreFixture();
		try {
			const consumer = createPartitionControl();
			const follower = createKafkaPartitionOutcomeFollower({
				consumer,
				partitionOffsets: createPartitionOffsets({ low: "0", high: "0" }),
				stateStore: fixture.store,
				positionTracker: new KafkaPartitionPositionTracker(),
			});

			await follower.startAndCatchUp({
				topic,
				partition,
				onUnavailable: () => undefined,
			});

			expect(consumer.seeks).toEqual([{ topic, partition, offset: "0" }]);
			expect(consumer.resumes).toEqual([{ topic, partitions: [partition] }]);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("refuses state that is outside the retained Kafka range", async () => {
		const behindFixture = createStoreFixture({ nextOffset: 4n });
		const aheadFixture = createStoreFixture({ nextOffset: 12n });
		try {
			const behindFollower = createKafkaPartitionOutcomeFollower({
				consumer: createPartitionControl(),
				partitionOffsets: createPartitionOffsets({ low: "5", high: "10" }),
				stateStore: behindFixture.store,
				positionTracker: new KafkaPartitionPositionTracker(),
			});
			const aheadFollower = createKafkaPartitionOutcomeFollower({
				consumer: createPartitionControl(),
				partitionOffsets: createPartitionOffsets({ low: "5", high: "10" }),
				stateStore: aheadFixture.store,
				positionTracker: new KafkaPartitionPositionTracker(),
			});

			await expect(
				behindFollower.startAndCatchUp({
					topic,
					partition,
					onUnavailable: () => undefined,
				}),
			).rejects.toBeInstanceOf(StateBehindKafkaLogStartError);
			await expect(
				aheadFollower.startAndCatchUp({
					topic,
					partition,
					onUnavailable: () => undefined,
				}),
			).rejects.toBeInstanceOf(StateAheadOfKafkaLogEndError);
		} finally {
			closeStoreFixture(behindFixture);
			closeStoreFixture(aheadFixture);
		}
	});

	test("fails startup when the assigned partition has not been bootstrapped", async () => {
		const fixture = createStoreFixture();
		try {
			const follower = createKafkaPartitionOutcomeFollower({
				consumer: createPartitionControl(),
				partitionOffsets: createPartitionOffsets({ low: "0", high: "0" }),
				stateStore: fixture.store,
				positionTracker: new KafkaPartitionPositionTracker(),
			});

			await expect(
				follower.startAndCatchUp({
					topic,
					partition: 1,
					onUnavailable: () => undefined,
				}),
			).rejects.toBeInstanceOf(PartitionProgressNotFoundError);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("stopping pauses the partition and settles pending catch-up", async () => {
		const fixture = createStoreFixture();
		try {
			const consumer = createPartitionControl();
			const follower = createKafkaPartitionOutcomeFollower({
				consumer,
				partitionOffsets: createPartitionOffsets({ low: "0", high: "5" }),
				stateStore: fixture.store,
				positionTracker: new KafkaPartitionPositionTracker(),
			});
			const catchUp = follower.startAndCatchUp({
				topic,
				partition,
				onUnavailable: () => undefined,
			});
			await Promise.resolve();

			await follower.stop();

			await expect(catchUp).rejects.toBeInstanceOf(
				KafkaPartitionFollowerStoppedError,
			);
			expect(consumer.pauses).toEqual([{ topic, partitions: [partition] }]);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("signals a live follower failure once", async () => {
		const fixture = createStoreFixture();
		try {
			const follower = createKafkaPartitionOutcomeFollower({
				consumer: createPartitionControl(),
				partitionOffsets: createPartitionOffsets({ low: "0", high: "0" }),
				stateStore: fixture.store,
				positionTracker: new KafkaPartitionPositionTracker(),
			});
			const failures: unknown[] = [];
			await follower.startAndCatchUp({
				topic,
				partition,
				onUnavailable: ({ cause }) => failures.push(cause),
			});
			const failure = new Error("consumer crashed");

			follower.markUnavailable({ cause: failure });
			follower.markUnavailable({ cause: new Error("duplicate signal") });

			expect(failures).toEqual([failure]);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("cancels catch-up when the shared consumer becomes unavailable", async () => {
		const fixture = createStoreFixture();
		try {
			const follower = createKafkaPartitionOutcomeFollower({
				consumer: createPartitionControl(),
				partitionOffsets: createPartitionOffsets({ low: "0", high: "5" }),
				stateStore: fixture.store,
				positionTracker: new KafkaPartitionPositionTracker(),
			});
			const failures: unknown[] = [];
			const catchUp = follower.startAndCatchUp({
				topic,
				partition,
				onUnavailable: ({ cause }) => failures.push(cause),
			});
			await Promise.resolve();
			const failure = new Error("consumer crashed during catch-up");

			follower.markUnavailable({ cause: failure });

			await expect(catchUp).rejects.toBe(failure);
			expect(failures).toEqual([failure]);
			await follower.stop();
		} finally {
			closeStoreFixture(fixture);
		}
	});
});
