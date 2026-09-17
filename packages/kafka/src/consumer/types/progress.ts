export type PartitionPosition = { topic: string; partition: number };
export type PartitionProgress = {
	consumedNextOffset: bigint | null;
	highWatermark: bigint | null;
};
export type ProgressPosition = PartitionPosition & { nextOffset: bigint };
export type HighWatermarkPosition = PartitionPosition & {
	highWatermark: bigint;
};
export type ProgressWait = ProgressPosition & { signal?: AbortSignal };
export type ProgressTracker = {
	advance(position: ProgressPosition): void;
	observeHighWatermark(position: HighWatermarkPosition): void;
	read(position: PartitionPosition): bigint | null;
	readProgress(position: PartitionPosition): PartitionProgress;
	waitUntil(position: ProgressWait): Promise<void>;
};
export type PositionWaiter = {
	nextOffset: bigint;
	resolve(): void;
	removeAbortListener(): void;
};
export type PartitionLogRange = {
	logStartOffset: bigint;
	logEndOffset: bigint;
};
