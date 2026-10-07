/** What the swarm child needs from the sizing decision. */
export type SwarmSizing = {
	filesPerWorker: number;
	/** Absolute paths of main-shard files that run one per worker. */
	soloFiles: string[];
	/** Planned workers per shard key; null keeps the child's proportional split. */
	shardWorkers: Record<string, number> | null;
};
