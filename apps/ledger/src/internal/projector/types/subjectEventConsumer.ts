import type { PartitionLag } from "./partitionLag.js";
import type { SubjectEventBatch } from "./subjectEventBatch.js";

export type SubjectEventConsumer = {
	// Commits a batch's offsets only once `onBatch` has resolved, so a crash
	// replays the batch instead of skipping it.
	start: (params: {
		onBatch: (params: { batch: SubjectEventBatch }) => Promise<void>;
	}) => Promise<void>;
	readLag: () => Promise<PartitionLag[]>;
	stop: () => Promise<void>;
};
