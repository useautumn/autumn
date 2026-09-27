import type { PreparedPartitionCheckpoint } from "./partitionCheckpoint.js";
import {
	PartitionCheckpointLimitExceededError,
	type PartitionCheckpointLimits,
} from "./partitionCheckpointLimits.js";
import type {
	PartitionCheckpointPublisher,
	PartitionCheckpointPublishResult,
} from "./partitionCheckpointPublisher.js";

export type PartitionCheckpointCapture = {
	capturePartitionCheckpoint({
		topic,
		partition,
		createdAt,
		limits,
		consumedNextOffset,
	}: {
		topic: string;
		partition: number;
		createdAt: number;
		limits: PartitionCheckpointLimits;
		/** Only the current follower's fully applied read-committed position is safe here. */
		consumedNextOffset?: bigint | null;
	}): PreparedPartitionCheckpoint;
};

export type PartitionCheckpointClock = {
	now(): number;
};

export class PartitionCheckpointCaptureError extends Error {
	constructor({ cause }: { cause: unknown }) {
		super("Unable to capture local partition checkpoint", { cause });
		this.name = "PartitionCheckpointCaptureError";
	}
}

export type PartitionCheckpointExportResult =
	PartitionCheckpointPublishResult & {
		createdAt: number;
		nextOffset: bigint;
		stateCount: number;
		receiptCount: number;
		serializedBytes: number;
	};

const throwIfAborted = ({ signal }: { signal: AbortSignal }): void => {
	if (!signal.aborted) return;
	throw signal.reason ?? new Error("Partition checkpoint export aborted");
};

export const createPartitionCheckpointExporter = ({
	stateStore,
	publisher,
	clock,
	limits,
}: {
	stateStore: PartitionCheckpointCapture;
	publisher: PartitionCheckpointPublisher;
	clock: PartitionCheckpointClock;
	limits: PartitionCheckpointLimits;
}): {
	export({
		topic,
		partition,
		signal,
		consumedNextOffset,
	}: {
		topic: string;
		partition: number;
		signal: AbortSignal;
		consumedNextOffset?: bigint | null;
	}): Promise<PartitionCheckpointExportResult>;
} => ({
	export: async ({ topic, partition, signal, consumedNextOffset = null }) => {
		throwIfAborted({ signal });
		const createdAt = clock.now();
		let checkpoint: PreparedPartitionCheckpoint;
		try {
			checkpoint = stateStore.capturePartitionCheckpoint({
				topic,
				partition,
				createdAt,
				limits,
				consumedNextOffset,
			});
		} catch (cause) {
			if (cause instanceof PartitionCheckpointLimitExceededError) throw cause;
			throw new PartitionCheckpointCaptureError({ cause });
		}
		throwIfAborted({ signal });
		const result = await publisher.publish({ checkpoint, signal });
		throwIfAborted({ signal });
		return {
			...result,
			createdAt,
			nextOffset: checkpoint.nextOffset,
			stateCount: checkpoint.stateCount,
			receiptCount: checkpoint.receiptCount,
			serializedBytes: checkpoint.serializedBytes,
		};
	},
});

export type PartitionCheckpointExporter = ReturnType<
	typeof createPartitionCheckpointExporter
>;
