import type { PartitionPosition } from "../types/committer.js";

/** Postgres holds both bookmarks; this mirror makes them readable inside synchronous code. */
export type ProgressMirror = {
	readNextOffset(position: PartitionPosition): bigint | null;
	setNextOffset(position: PartitionPosition & { nextOffset: bigint }): void;
	readCommandNextOffset(position: PartitionPosition): bigint | null;
	setCommandNextOffset(
		position: PartitionPosition & { commandNextOffset: bigint },
	): void;
};

const keyOf = ({ topic, partition }: PartitionPosition): string =>
	`${topic}[${partition}]`;

export const createProgressMirror = (): ProgressMirror => {
	const nextOffsetByPartition = new Map<string, bigint>();
	const commandNextOffsetByPartition = new Map<string, bigint>();
	function readNextOffset(position: PartitionPosition) {
		return nextOffsetByPartition.get(keyOf(position)) ?? null;
	}
	function setNextOffset({
		nextOffset,
		...position
	}: PartitionPosition & { nextOffset: bigint }) {
		nextOffsetByPartition.set(keyOf(position), nextOffset);
	}
	function readCommandNextOffset(position: PartitionPosition) {
		return commandNextOffsetByPartition.get(keyOf(position)) ?? null;
	}
	function setCommandNextOffset({
		commandNextOffset,
		...position
	}: PartitionPosition & { commandNextOffset: bigint }) {
		const key = keyOf(position);
		const current = commandNextOffsetByPartition.get(key);
		if (current === undefined || commandNextOffset > current)
			commandNextOffsetByPartition.set(key, commandNextOffset);
	}
	return {
		readNextOffset,
		setNextOffset,
		readCommandNextOffset,
		setCommandNextOffset,
	};
};
