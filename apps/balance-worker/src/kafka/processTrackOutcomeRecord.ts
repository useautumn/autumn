import {
	ConflictingTrackReceiptError,
	OutOfOrderTrackOutcomeError,
	StaleTrackOutcomeError,
	TrackOutcomeSubjectMismatchError,
} from "@autumn/balance-engine";
import {
	CorruptBalanceStateError,
	MeteringStateNotFoundError,
	PartitionProgressNotFoundError,
	UnexpectedKafkaOffsetError,
} from "../state/sqliteBalanceStateErrors.js";
import type {
	DurableTrackOutcomeApplyResult,
	SqliteBalanceStateStore,
} from "../state/sqliteBalanceStateStore.js";
import {
	InvalidKafkaTrackOutcomeRecordError,
	KafkaTrackOutcomeKeyMismatchError,
	parseKafkaTrackOutcomeRecord,
	UnsupportedKafkaTrackOutcomeRecordVersionError,
} from "./trackOutcomeRecord.js";

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
	cause instanceof InvalidKafkaTrackOutcomeRecordError ||
	cause instanceof UnsupportedKafkaTrackOutcomeRecordVersionError ||
	cause instanceof KafkaTrackOutcomeKeyMismatchError ||
	cause instanceof ConflictingTrackReceiptError ||
	cause instanceof OutOfOrderTrackOutcomeError ||
	cause instanceof StaleTrackOutcomeError ||
	cause instanceof TrackOutcomeSubjectMismatchError ||
	cause instanceof CorruptBalanceStateError ||
	cause instanceof MeteringStateNotFoundError ||
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

export const processTrackOutcomeRecord = ({
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
}): DurableTrackOutcomeApplyResult => {
	try {
		const offset = parseKafkaRecordOffset({ offset: message.offset });
		const outcome = parseKafkaTrackOutcomeRecord({
			key: message.key,
			value: message.value,
		});

		return stateStore.applyDurableTrackOutcome({
			position: { topic, partition, offset },
			outcome,
		});
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
