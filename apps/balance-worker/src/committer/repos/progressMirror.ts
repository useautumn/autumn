import type { PartitionPosition } from "../types/committer.js";

/** Postgres holds the bookmark; this mirror makes it readable inside synchronous code. */
export type ProgressMirror = {
	readNextOffset(position: PartitionPosition): bigint | null;
	setNextOffset(position: PartitionPosition & { nextOffset: bigint }): void;
};

const keyOf = ({ topic, partition }: PartitionPosition): string =>
	`${topic}[${partition}]`;

export const createProgressMirror = (): ProgressMirror => {
	const nextOffsetByPartition = new Map<string, bigint>();
	return {
		readNextOffset: (position) =>
			nextOffsetByPartition.get(keyOf(position)) ?? null,
		setNextOffset: ({ nextOffset, ...position }) => {
			nextOffsetByPartition.set(keyOf(position), nextOffset);
		},
	};
};
