import {
	ConflictingTrackReceiptError,
	OutOfOrderTrackOutcomeError,
	StaleTrackOutcomeError,
	TrackOutcomeSubjectMismatchError,
} from "@autumn/balance-engine";
import {
	ConflictingMeteringStateInitializationError,
	CorruptBalanceStateError,
	MeteringStateNotFoundError,
	MeteringStatePartitionMismatchError,
	PartitionProgressNotFoundError,
	UnexpectedKafkaOffsetError,
} from "../state/sqliteBalanceStateErrors.js";
import type {
	DurableStateInitializationApplyResult,
	DurableTrackOutcomeApplyResult,
	SqliteBalanceStateStore,
} from "../state/sqliteBalanceStateStore.js";
import {
	InvalidKafkaMeteringRecordError,
	KafkaMeteringRecordKeyMismatchError,
	parseKafkaMeteringRecord,
	UnsupportedKafkaMeteringRecordVersionError,
} from "./kafkaMeteringRecord.js";

export class InvalidKafkaRecordOffsetError extends Error {
	readonly retriable = false;
	readonly offset: string;

	constructor({ offset }: { offset: string }) {
		super(`Invalid Kafka record offset: ${offset}`);
		this.name = "InvalidKafkaRecordOffsetError";
		this.offset = offset;
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

const isKafkaPartitionInvariantCause = (cause: unknown): cause is Error =>
	cause instanceof InvalidKafkaRecordOffsetError ||
	cause instanceof InvalidKafkaMeteringRecordError ||
	cause instanceof UnsupportedKafkaMeteringRecordVersionError ||
	cause instanceof KafkaMeteringRecordKeyMismatchError ||
	cause instanceof ConflictingTrackReceiptError ||
	cause instanceof ConflictingMeteringStateInitializationError ||
	cause instanceof OutOfOrderTrackOutcomeError ||
	cause instanceof StaleTrackOutcomeError ||
	cause instanceof TrackOutcomeSubjectMismatchError ||
	cause instanceof CorruptBalanceStateError ||
	cause instanceof MeteringStateNotFoundError ||
	cause instanceof MeteringStatePartitionMismatchError ||
	cause instanceof PartitionProgressNotFoundError ||
	cause instanceof UnexpectedKafkaOffsetError;

export const parseKafkaRecordOffset = ({
	offset,
}: {
	offset: string;
}): bigint => {
	let parsedOffset: bigint;
	try {
		parsedOffset = BigInt(offset);
	} catch {
		throw new InvalidKafkaRecordOffsetError({ offset });
	}
	if (parsedOffset < 0n) throw new InvalidKafkaRecordOffsetError({ offset });
	return parsedOffset;
};

export type DurableMeteringRecordApplyResult =
	| DurableStateInitializationApplyResult
	| DurableTrackOutcomeApplyResult;

export const processKafkaMeteringRecord = ({
	topic,
	partition,
	message,
	stateStore,
}: {
	topic: string;
	partition: number;
	message: {
		offset: string;
		key: Buffer | null;
		value: Buffer | null;
	};
	stateStore: SqliteBalanceStateStore;
}): DurableMeteringRecordApplyResult => {
	try {
		const offset = parseKafkaRecordOffset({ offset: message.offset });
		const record = parseKafkaMeteringRecord({
			key: message.key,
			value: message.value,
		});
		const position = { topic, partition, offset };

		return record.type === "state_initialized"
			? stateStore.applyDurableStateInitialization({
					position,
					initialization: record,
				})
			: stateStore.applyDurableTrackOutcome({ position, outcome: record });
	} catch (cause) {
		if (!isKafkaPartitionInvariantCause(cause)) throw cause;
		throw new KafkaPartitionInvariantError({
			topic,
			partition,
			offset: message.offset,
			cause,
		});
	}
};
