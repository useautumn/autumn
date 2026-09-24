import type { PartitionCheckpointV1 } from "./partitionCheckpoint.js";

export type PartitionCheckpointSource = {
	/** The checkpoint must contain states, receipts, and offset from one consistent database cut. */
	latest({
		topic,
		partition,
		signal,
	}: {
		topic: string;
		partition: number;
		signal: AbortSignal;
	}): Promise<PartitionCheckpointV1 | null>;
	/** The latest checkpoint's serialized size without loading it; null when the partition has none. */
	size?({
		topic,
		partition,
		signal,
	}: {
		topic: string;
		partition: number;
		signal: AbortSignal;
	}): Promise<number | null>;
};

export class PartitionCheckpointSourceError extends Error {
	readonly retriable: boolean;

	constructor({
		message,
		retriable,
		cause,
	}: {
		message: string;
		retriable: boolean;
		cause?: unknown;
	}) {
		super(message, { cause });
		this.name = "PartitionCheckpointSourceError";
		this.retriable = retriable;
	}
}
