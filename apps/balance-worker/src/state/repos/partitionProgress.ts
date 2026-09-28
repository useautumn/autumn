import type { StateStoreContext } from "../types/stateStoreContext.js";

type PartitionProgressRow = {
	nextOffset: bigint;
};

export const readNextOffset = ({
	ctx,
	topic,
	partition,
}: {
	ctx: StateStoreContext;
	topic: string;
	partition: number;
}): bigint | null => {
	const row = ctx.sqliteDb
		.query<PartitionProgressRow, { topic: string; partition: number }>(`
			SELECT next_offset AS nextOffset
			FROM partition_progress
			WHERE topic = $topic AND partition_id = $partition
		`)
		.get({ topic, partition });
	return row?.nextOffset ?? null;
};

export const insertPartitionProgress = ({
	ctx,
	topic,
	partition,
	nextOffset,
}: {
	ctx: StateStoreContext;
	topic: string;
	partition: number;
	nextOffset: bigint;
}) => {
	ctx.sqliteDb
		.query<never, { topic: string; partition: number; nextOffset: bigint }>(`
			INSERT INTO partition_progress (topic, partition_id, next_offset)
			VALUES ($topic, $partition, $nextOffset)
		`)
		.run({ topic, partition, nextOffset });
};

export const advancePartitionProgress = ({
	ctx,
	topic,
	partition,
	expectedOffset,
	nextOffset,
}: {
	ctx: StateStoreContext;
	topic: string;
	partition: number;
	expectedOffset: bigint;
	nextOffset: bigint;
}) =>
	ctx.sqliteDb
		.query<
			never,
			{
				topic: string;
				partition: number;
				expectedOffset: bigint;
				nextOffset: bigint;
			}
		>(`
			UPDATE partition_progress
			SET next_offset = $nextOffset
			WHERE topic = $topic
				AND partition_id = $partition
				AND next_offset = $expectedOffset
		`)
		.run({ topic, partition, expectedOffset, nextOffset });

export const deletePartitionProgress = ({
	ctx,
	topic,
	partition,
}: {
	ctx: StateStoreContext;
	topic: string;
	partition: number;
}) => {
	ctx.sqliteDb
		.query<never, { topic: string; partition: number }>(`
			DELETE FROM partition_progress
			WHERE topic = $topic AND partition_id = $partition
		`)
		.run({ topic, partition });
};
