import {
	advancePartitionProgress,
	readNextOffset,
} from "../../repos/partitionProgress.js";
import {
	PartitionProgressNotFoundError,
	UnexpectedKafkaOffsetError,
} from "../../sqliteBalanceStateErrors.js";
import type { KafkaRecordPosition } from "../../types/kafkaRecordPosition.js";
import type { StateStoreContext } from "../../types/stateStoreContext.js";

export const requireNextOffset = ({
	ctx,
	position,
}: {
	ctx: StateStoreContext;
	position: KafkaRecordPosition;
}): bigint => {
	const expectedOffset = readNextOffset({
		ctx,
		topic: position.topic,
		partition: position.partition,
	});
	if (expectedOffset !== null) return expectedOffset;
	throw new PartitionProgressNotFoundError({
		topic: position.topic,
		partition: position.partition,
	});
};

export const advanceProgress = ({
	ctx,
	position,
	expectedOffset,
	nextOffset,
}: {
	ctx: StateStoreContext;
	position: KafkaRecordPosition;
	expectedOffset: bigint;
	nextOffset: bigint;
}): void => {
	const progressUpdate = advancePartitionProgress({
		ctx,
		topic: position.topic,
		partition: position.partition,
		expectedOffset,
		nextOffset,
	});
	if (progressUpdate.changes !== 1) {
		throw new UnexpectedKafkaOffsetError({
			topic: position.topic,
			partition: position.partition,
			expectedOffset,
			receivedOffset: position.offset,
		});
	}
};
