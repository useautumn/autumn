import type { PartitionCheckpointV1 } from "./partitionCheckpoint.js";

export type PartitionCheckpointSource = {
	latest({
		topic,
		partition,
		signal,
	}: {
		topic: string;
		partition: number;
		signal: AbortSignal;
	}): Promise<PartitionCheckpointV1 | null>;
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
