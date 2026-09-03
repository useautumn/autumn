import type { Consumer } from "kafkajs";
import type { PartitionOutcomeFollowerPort } from "../runtime/ownedPartitionRuntime.js";
import { PartitionProgressNotFoundError } from "../state/sqliteBalanceStateErrors.js";
import type { SqliteBalanceStateStore } from "../state/sqliteBalanceStateStore.js";
import type { KafkaPartitionPositionTrackerPort } from "./kafkaPartitionPositionTracker.js";
import {
	KafkaPartitionOffsetsNotFoundError,
	type KafkaPartitionOffsetsPort,
	StateBehindKafkaLogStartError,
} from "./kafkaTrackOutcomeConsumer.js";
import { parseKafkaRecordOffset } from "./processTrackOutcomeRecord.js";

export type KafkaPartitionControlPort = Pick<
	Consumer,
	"pause" | "resume" | "seek"
>;

export class StateAheadOfKafkaLogEndError extends Error {
	readonly retriable = false;
	readonly storedNextOffset: bigint;
	readonly logEndOffset: bigint;

	constructor({
		topic,
		partition,
		storedNextOffset,
		logEndOffset,
	}: {
		topic: string;
		partition: number;
		storedNextOffset: bigint;
		logEndOffset: bigint;
	}) {
		super(
			`Stored state for ${topic}[${partition}] expects offset ${storedNextOffset}, but the Kafka log ends at ${logEndOffset}`,
		);
		this.name = "StateAheadOfKafkaLogEndError";
		this.storedNextOffset = storedNextOffset;
		this.logEndOffset = logEndOffset;
	}
}

export class KafkaPartitionFollowerStoppedError extends Error {
	constructor({ topic, partition }: { topic: string; partition: number }) {
		super(`Kafka partition follower stopped for ${topic}[${partition}]`);
		this.name = "KafkaPartitionFollowerStoppedError";
	}
}

export type KafkaPartitionOutcomeFollower = PartitionOutcomeFollowerPort & {
	markUnavailable({ cause }: { cause: unknown }): void;
};

export const createKafkaPartitionOutcomeFollower = ({
	consumer,
	partitionOffsets,
	stateStore,
	positionTracker,
}: {
	consumer: KafkaPartitionControlPort;
	partitionOffsets: KafkaPartitionOffsetsPort;
	stateStore: Pick<SqliteBalanceStateStore, "readNextOffset">;
	positionTracker: KafkaPartitionPositionTrackerPort;
}): KafkaPartitionOutcomeFollower => {
	let status: "created" | "starting" | "following" | "unavailable" | "stopped" =
		"created";
	let assignedTopic: string | null = null;
	let assignedPartition: number | null = null;
	let onUnavailable: (({ cause }: { cause: unknown }) => void) | null = null;
	let abortController: AbortController | null = null;
	let startPromise: Promise<void> | null = null;
	let stopPromise: Promise<void> | null = null;

	const pauseAssignedPartition = (): void => {
		if (assignedTopic === null || assignedPartition === null) return;
		consumer.pause([{ topic: assignedTopic, partitions: [assignedPartition] }]);
	};

	const startAndCatchUp: PartitionOutcomeFollowerPort["startAndCatchUp"] = ({
		topic,
		partition,
		onUnavailable: handleUnavailable,
	}) => {
		if (status !== "created") {
			return Promise.reject(
				new Error(`Kafka partition follower cannot start while ${status}`),
			);
		}
		if (topic.trim().length === 0) {
			return Promise.reject(new Error("Kafka topic cannot be empty"));
		}
		if (!Number.isSafeInteger(partition) || partition < 0) {
			return Promise.reject(
				new RangeError(`Invalid Kafka partition: ${partition}`),
			);
		}

		status = "starting";
		assignedTopic = topic;
		assignedPartition = partition;
		onUnavailable = handleUnavailable;
		abortController = new AbortController();
		const { signal } = abortController;

		startPromise = (async () => {
			const storedNextOffset = stateStore.readNextOffset({ topic, partition });
			if (storedNextOffset === null) {
				throw new PartitionProgressNotFoundError({ topic, partition });
			}

			const offsets = await partitionOffsets.fetchTopicOffsets(topic);
			if (signal.aborted) throw signal.reason;
			const partitionRange = offsets.find(
				(candidate) => candidate.partition === partition,
			);
			if (!partitionRange) {
				throw new KafkaPartitionOffsetsNotFoundError({ topic, partition });
			}
			const logStartOffset = parseKafkaRecordOffset({
				offset: partitionRange.low,
			});
			const logEndOffset = parseKafkaRecordOffset({
				offset: partitionRange.high,
			});
			if (storedNextOffset < logStartOffset) {
				throw new StateBehindKafkaLogStartError({
					topic,
					partition,
					storedNextOffset,
					logStartOffset,
				});
			}
			if (storedNextOffset > logEndOffset) {
				throw new StateAheadOfKafkaLogEndError({
					topic,
					partition,
					storedNextOffset,
					logEndOffset,
				});
			}

			positionTracker.advance({
				topic,
				partition,
				nextOffset: storedNextOffset,
			});
			consumer.seek({
				topic,
				partition,
				offset: storedNextOffset.toString(),
			});
			consumer.resume([{ topic, partitions: [partition] }]);
			await positionTracker.waitUntil({
				topic,
				partition,
				nextOffset: logEndOffset,
				signal,
			});
			if (signal.aborted) throw signal.reason;
			status = "following";
		})();
		return startPromise;
	};

	const stop = (): Promise<void> => {
		if (stopPromise) return stopPromise;
		if (status === "stopped") return Promise.resolve();
		status = "stopped";
		const stoppedError = new KafkaPartitionFollowerStoppedError({
			topic: assignedTopic ?? "unassigned",
			partition: assignedPartition ?? 0,
		});
		abortController?.abort(stoppedError);
		pauseAssignedPartition();
		stopPromise = startPromise?.catch(() => undefined) ?? Promise.resolve();
		return stopPromise;
	};

	const markUnavailable = ({ cause }: { cause: unknown }): void => {
		if (
			status === "created" ||
			status === "unavailable" ||
			status === "stopped"
		) {
			return;
		}
		status = "unavailable";
		abortController?.abort(cause);
		onUnavailable?.({ cause });
	};

	return { startAndCatchUp, stop, markUnavailable };
};
