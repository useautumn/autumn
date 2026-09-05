import type { PartitionCheckpointV1 } from "./partitionCheckpoint.js";
import type { PartitionCheckpointLimits } from "./partitionCheckpointLimits.js";
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
	}: {
		topic: string;
		partition: number;
		createdAt: number;
		limits: PartitionCheckpointLimits;
	}): PartitionCheckpointV1;
};

export type PartitionCheckpointClock = {
	now(): number;
};

export type PartitionCheckpointExportResult =
	PartitionCheckpointPublishResult & {
		createdAt: number;
		nextOffset: bigint;
		stateCount: number;
		receiptCount: number;
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
	}: {
		topic: string;
		partition: number;
		signal: AbortSignal;
	}): Promise<PartitionCheckpointExportResult>;
} => ({
	export: async ({ topic, partition, signal }) => {
		throwIfAborted({ signal });
		const createdAt = clock.now();
		const checkpoint = stateStore.capturePartitionCheckpoint({
			topic,
			partition,
			createdAt,
			limits,
		});
		throwIfAborted({ signal });
		const result = await publisher.publish({ checkpoint, signal });
		return {
			...result,
			createdAt,
			nextOffset: checkpoint.nextOffset,
			stateCount: checkpoint.states.length,
			receiptCount: checkpoint.receipts.length,
		};
	},
});
