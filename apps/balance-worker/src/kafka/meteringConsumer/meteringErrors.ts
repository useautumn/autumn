import {
	MutationSubjectMismatchError,
	OutOfOrderMutationError,
	StaleMutationError,
} from "@autumn/balance-engine";
import {
	InvalidKafkaOffsetError,
	InvalidRecordError,
	RecordKeyMismatchError,
	UnsupportedRecordVersionError,
} from "@autumn/kafka";
import {
	ConflictingMutationReceiptError,
	CorruptBalanceStateError,
	MeteringStatePartitionMismatchError,
	PartitionProgressNotFoundError,
	UnexpectedKafkaOffsetError,
} from "../../state/stateStoreErrors.js";

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
		cause instanceof StaleMutationError ||
		cause instanceof OutOfOrderMutationError ||
		cause instanceof MutationSubjectMismatchError ||
		cause instanceof ConflictingMutationReceiptError ||
		cause instanceof CorruptBalanceStateError ||
		cause instanceof MeteringStatePartitionMismatchError ||
		cause instanceof PartitionProgressNotFoundError ||
		cause instanceof UnexpectedKafkaOffsetError
	);
}

/** The partition's log cannot be read past this point: the partition parks, the rest of the group carries on. */
export function isPartitionLogUnreadableCause({
	cause,
}: {
	cause: unknown;
}): boolean {
	const seen = new Set<unknown>();
	let current = cause;
	while (
		typeof current === "object" &&
		current !== null &&
		!seen.has(current)
	) {
		if (
			current instanceof KafkaPartitionInvariantError ||
			current instanceof StateBehindKafkaLogStartError
		)
			return true;
		seen.add(current);
		if (!("cause" in current)) return false;
		current = current.cause;
	}
	return false;
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
