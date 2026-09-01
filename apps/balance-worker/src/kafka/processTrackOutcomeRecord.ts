import type {
	DurableTrackOutcomeApplyResult,
	SqliteBalanceStateStore,
} from "../state/sqliteBalanceStateStore.js";
import { parseKafkaTrackOutcomeRecord } from "./trackOutcomeRecord.js";

export class InvalidKafkaRecordOffsetError extends Error {
	readonly offset: string;

	constructor({ offset }: { offset: string }) {
		super(`Invalid Kafka record offset: ${offset}`);
		this.name = "InvalidKafkaRecordOffsetError";
		this.offset = offset;
	}
}

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
	const offset = parseKafkaRecordOffset({ offset: message.offset });
	const outcome = parseKafkaTrackOutcomeRecord({
		key: message.key,
		value: message.value,
	});

	return stateStore.applyDurableTrackOutcome({
		position: { topic, partition, offset },
		outcome,
	});
};
