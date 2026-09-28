import type { OwnerFence } from "../../state/types/stateStore.js";
import type { PartitionPosition } from "../types/committer.js";

/** Postgres holds both bookmarks; this mirror makes them readable inside synchronous code. */
export type ProgressMirror = {
	readNextOffset(position: PartitionPosition): bigint | null;
	setNextOffset(position: PartitionPosition & { nextOffset: bigint }): void;
	readCommandNextOffset(position: PartitionPosition): bigint | null;
	setCommandNextOffset(
		position: PartitionPosition & { commandNextOffset: bigint },
	): void;
	readOwnerFence(position: PartitionPosition): OwnerFence | null;
	/** Only a higher epoch replaces the fence; its offset moves with it. */
	setOwnerFence(position: PartitionPosition & { fence: OwnerFence }): void;
};

const keyOf = ({ topic, partition }: PartitionPosition): string =>
	`${topic}[${partition}]`;

export const createProgressMirror = (): ProgressMirror => {
	const nextOffsetByPartition = new Map<string, bigint>();
	const commandNextOffsetByPartition = new Map<string, bigint>();
	const ownerFenceByPartition = new Map<string, OwnerFence>();
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
	function readOwnerFence(position: PartitionPosition) {
		return ownerFenceByPartition.get(keyOf(position)) ?? null;
	}
	function setOwnerFence({
		fence,
		...position
	}: PartitionPosition & { fence: OwnerFence }) {
		const key = keyOf(position);
		const current = ownerFenceByPartition.get(key);
		if (current === undefined || fence.epoch > current.epoch)
			ownerFenceByPartition.set(key, fence);
	}
	return {
		readNextOffset,
		setNextOffset,
		readCommandNextOffset,
		setCommandNextOffset,
		readOwnerFence,
		setOwnerFence,
	};
};
