import type { PartitionCheckpointV1 } from "./partitionCheckpoint.js";

export type PartitionCheckpointPublishResult =
	| { kind: "published"; etag: string }
	| { kind: "skipped"; remoteNextOffset: bigint };

export type PartitionCheckpointPublisher = {
	publish({
		checkpoint,
		signal,
	}: {
		checkpoint: PartitionCheckpointV1;
		signal: AbortSignal;
	}): Promise<PartitionCheckpointPublishResult>;
};

export class PartitionCheckpointPublisherError extends Error {
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
		this.name = "PartitionCheckpointPublisherError";
		this.retriable = retriable;
	}
}
