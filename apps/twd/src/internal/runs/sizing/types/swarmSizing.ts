export type SwarmSizing = {
	filesPerWorker: number;
	soloFiles: string[];
	shardWorkers: Record<string, number> | null;
};
