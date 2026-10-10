import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

/**
 * Every record of the partition at or below it is in what this owner reads now: the last record it appended, or before
 * its first append, the log its store held at activation. Only ever low, never high, so a reader can trust it.
 */
export const readLogOffset = ({
	scope,
}: {
	scope: PartitionProcessorScope;
}): bigint => {
	const { writer, stateStore, config } = scope.ctx;
	const appendedThrough = writer.readAppendedThrough();
	if (appendedThrough !== null) return appendedThrough;
	const nextOffset =
		stateStore.readNextOffset({
			topic: config.topic,
			partition: config.partition,
		}) ?? 0n;
	return nextOffset > 0n ? nextOffset - 1n : 0n;
};
