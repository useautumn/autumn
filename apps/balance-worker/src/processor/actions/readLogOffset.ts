import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

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
