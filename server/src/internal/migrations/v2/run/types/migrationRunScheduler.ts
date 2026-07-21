export type MigrationRunScheduler = {
	sliceDurationMs: number;
	now: () => number;
	onSliceComplete: () => Promise<void>;
};
