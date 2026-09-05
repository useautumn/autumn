import { createProgressTracker } from "@autumn/kafka";
import { createPartitionReplay } from "../../../src/kafka/meteringConsumer/replay/createPartitionReplay.js";

async function coordinatesReplayWithoutMutatingConsumer(): Promise<void> {
	const events: string[] = [];
	const batch = Promise.withResolvers<void>();
	function readNextOffset(): bigint {
		return 0n;
	}
	async function fetchTopicOffsets() {
		return [{ partition: 2, offset: "0", low: "0", high: "0" }];
	}
	function seek(): void {
		events.push("seek");
	}
	function resume(): void {
		events.push("read");
	}
	function pause(): void {
		events.push("pause");
	}
	function resumePartition({ partition }: { partition: number }): void {
		events.push(`resume:${partition}`);
	}
	function withdrawPartition({
		partition,
	}: {
		partition: number;
	}): Promise<void> {
		events.push(`withdraw:${partition}`);
		return batch.promise;
	}
	function onUnavailable(): void {}
	const consumer = { seek, resume, pause };
	function seekPartition(): void {
		consumer.seek();
	}
	function pausePartition(): void {
		consumer.pause();
	}
	function resumeFetching(): void {
		consumer.resume();
	}
	const metering = createPartitionReplay({
		ctx: {
			stateStore: { readNextOffset },
			partitionOffsets: { fetchTopicOffsets },
			positionTracker: createProgressTracker(),
			consumption: {
				resumePartition,
				withdrawPartition,
				seekPartition,
				pausePartition,
				resumeFetching,
			},
		},
	});
	expect(consumer.resume).toBe(resume);
	expect(consumer.pause).toBe(pause);
	const starting = metering.startAndCatchUp({
		topic: "metering-events-v1",
		partition: 2,
		targetNextOffset: 0n,
		onUnavailable,
	});
	await starting;
	expect(events).toEqual(["resume:2", "seek", "read"]);
	const stopping = metering.stop();
	expect(events).toEqual(["resume:2", "seek", "read", "withdraw:2", "pause"]);
	expect(metering.stop()).toBe(stopping);
	await Promise.resolve();
	expect(
		await Promise.race([stopping, Promise.resolve("still-draining")]),
	).toBe("still-draining");
	batch.resolve();
	await stopping;
	expect(consumer.pause).toBe(pause);
}

test(
	"partition replay resumes before catch-up and waits for withdrawn batches without replacing consumer methods",
	coordinatesReplayWithoutMutatingConsumer,
);

import { describe, expect, test } from "bun:test";
import {
	KafkaPartitionFollowerStoppedError,
	StateAheadOfKafkaLogEndError,
} from "../../../src/kafka/meteringConsumer/meteringErrors.js";
import { PartitionProgressNotFoundError } from "../../../src/state/sqliteBalanceStateErrors.js";
import {
	closeStoreFixture,
	createKafkaPartitionOutcomeFollower,
	createStoreFixture,
	type KafkaPartitionControlPort,
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
}) => {
	const calls: string[] = [];
	return {
		calls,
		fetchTopicOffsets: async (requestedTopic: string) => {
			calls.push(requestedTopic);
			return [{ partition, offset: high, low, high }];
		},
	};
};

const activeSignal = (): AbortSignal => new AbortController().signal;

describe("Kafka partition outcome follower", () => {
	test("waits for the consumed position captured after ownership fencing", async () => {
		const fixture = createStoreFixture();
		try {
			const consumer = createPartitionControl();
			const positionTracker = createProgressTracker();
			const partitionOffsets = createPartitionOffsets({ low: "0", high: "5" });
			const follower = createKafkaPartitionOutcomeFollower({
				consumer,
				partitionOffsets,
				stateStore: fixture.store,
				positionTracker,
			});
			const logRange = await follower.readLogRange({
				topic,
				partition,
				signal: activeSignal(),
			});
			expect(logRange).toEqual({ logStartOffset: 0n, logEndOffset: 5n });
			expect(positionTracker.readProgress({ topic, partition })).toEqual({
				consumedNextOffset: null,
				highWatermark: 5n,
			});
			let caughtUp = false;
			const catchUp = follower
				.startAndCatchUp({
					topic,
					partition,
					targetNextOffset: logRange.logEndOffset,
					onUnavailable: () => undefined,
				})
				.then(() => {
					caughtUp = true;
				});

			await new Promise<void>(setImmediate);
			expect(consumer.seeks).toEqual([{ topic, partition, offset: "0" }]);
			expect(consumer.resumes).toEqual([{ topic, partitions: [partition] }]);

			positionTracker.advance({ topic, partition, nextOffset: 4n });
			await Promise.resolve();
			expect(caughtUp).toBe(false);

			positionTracker.advance({ topic, partition, nextOffset: 5n });
			await catchUp;
			expect(caughtUp).toBe(true);
			expect(partitionOffsets.calls).toEqual([topic]);
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
				positionTracker: createProgressTracker(),
			});

			await follower.startAndCatchUp({
				topic,
				partition,
				targetNextOffset: 0n,
				onUnavailable: () => undefined,
			});

			expect(consumer.seeks).toEqual([{ topic, partition, offset: "0" }]);
			expect(consumer.resumes).toEqual([{ topic, partitions: [partition] }]);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("refuses state ahead of the supplied catch-up target", async () => {
		const aheadFixture = createStoreFixture({ nextOffset: 12n });
		try {
			const aheadFollower = createKafkaPartitionOutcomeFollower({
				consumer: createPartitionControl(),
				partitionOffsets: createPartitionOffsets({ low: "5", high: "10" }),
				stateStore: aheadFixture.store,
				positionTracker: createProgressTracker(),
			});

			await expect(
				aheadFollower.startAndCatchUp({
					topic,
					partition,
					targetNextOffset: 10n,
					onUnavailable: () => undefined,
				}),
			).rejects.toBeInstanceOf(StateAheadOfKafkaLogEndError);
		} finally {
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
				positionTracker: createProgressTracker(),
			});

			await expect(
				follower.startAndCatchUp({
					topic,
					partition: 1,
					targetNextOffset: 0n,
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
				positionTracker: createProgressTracker(),
			});
			const catchUp = follower.startAndCatchUp({
				topic,
				partition,
				targetNextOffset: 5n,
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
				positionTracker: createProgressTracker(),
			});
			const failures: unknown[] = [];
			await follower.startAndCatchUp({
				topic,
				partition,
				targetNextOffset: 0n,
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
				positionTracker: createProgressTracker(),
			});
			const failures: unknown[] = [];
			const catchUp = follower.startAndCatchUp({
				topic,
				partition,
				targetNextOffset: 5n,
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
