import {
	ConflictingTrackReceiptError,
	OutOfOrderTrackOutcomeError,
	StaleTrackOutcomeError,
	TrackOutcomeSubjectMismatchError,
} from "@autumn/balance-engine";
import {
	InvalidKafkaOffsetError,
	InvalidRecordError,
	RecordKeyMismatchError,
	UnsupportedRecordVersionError,
} from "@autumn/kafka";
import {
	CorruptBalanceStateError,
	MeteringStateNotFoundError,
	PartitionProgressNotFoundError,
	UnexpectedKafkaOffsetError,
} from "../../state/sqliteBalanceStateErrors.js";

export class KafkaPartitionInvariantError extends Error {
	readonly retriable = false;
	readonly topic: string;
	readonly partition: number;
	readonly offset: string;

	constructor({
		topic,
		partition,
		offset,
		cause,
	}: {
		topic: string;
		partition: number;
		offset: string;
		cause: Error;
	}) {
		super(
			`Cannot fold invariant-breaking record at ${topic}[${partition}] offset ${offset}`,
			{ cause },
		);
		this.name = "KafkaPartitionInvariantError";
		this.topic = topic;
		this.partition = partition;
		this.offset = offset;
	}
}

export function isPartitionInvariantCause(cause: unknown): cause is Error {
	return (
		cause instanceof InvalidKafkaOffsetError ||
		cause instanceof InvalidRecordError ||
		cause instanceof UnsupportedRecordVersionError ||
		cause instanceof RecordKeyMismatchError ||
		cause instanceof ConflictingTrackReceiptError ||
		cause instanceof OutOfOrderTrackOutcomeError ||
		cause instanceof StaleTrackOutcomeError ||
		cause instanceof TrackOutcomeSubjectMismatchError ||
		cause instanceof CorruptBalanceStateError ||
		cause instanceof MeteringStateNotFoundError ||
		cause instanceof PartitionProgressNotFoundError ||
		cause instanceof UnexpectedKafkaOffsetError
	);
}

export class StateBehindKafkaLogStartError extends Error {
	readonly retriable = false;
	readonly storedNextOffset: bigint;
	readonly logStartOffset: bigint;

	constructor({
		topic,
		partition,
		storedNextOffset,
		logStartOffset,
	}: {
		topic: string;
		partition: number;
		storedNextOffset: bigint;
		logStartOffset: bigint;
	}) {
		super(
			`Stored state for ${topic}[${partition}] expects offset ${storedNextOffset}, but the Kafka log starts at ${logStartOffset}`,
		);
		this.name = "StateBehindKafkaLogStartError";
		this.storedNextOffset = storedNextOffset;
		this.logStartOffset = logStartOffset;
	}
}

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
