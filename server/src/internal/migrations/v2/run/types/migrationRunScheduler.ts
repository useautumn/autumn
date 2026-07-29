export type MigrationRunScheduler = {
	batchSize: number;
	sliceDurationMs: number;
	now: () => number;
};
