export type ShardDemand = {
	files: string[];
	started: number;
	/** Planned share of the run's workers. */
	target: number;
	provisioning: number;
	pool: { size: number };
	/** Runs on its own Stripe account, so pool accounts never join it. */
	dedicated: boolean;
	/** Files each worker runs at once; 1 when absent. */
	filesPerWorker?: number;
	/** Hard cap from the run's sizing; absent keeps growing while files wait. */
	maxWorkers?: number;
};

/** More workers this shard can use now: one per filesPerWorker unstarted files, up to its cap. */
export const shardShortfall = (shard: ShardDemand) => {
	if (shard.dedicated) return 0;
	const needed = Math.min(
		shard.maxWorkers ?? Number.POSITIVE_INFINITY,
		Math.ceil(
			(shard.files.length - shard.started) / (shard.filesPerWorker ?? 1),
		),
	);
	return Math.max(0, needed - shard.pool.size - shard.provisioning);
};

/** The pooled shard that can still use a worker and is furthest below its planned share. */
export const pickShard = <TShard extends ShardDemand>(
	shards: TShard[],
): TShard | undefined =>
	shards
		.filter((shard) => shardShortfall(shard) > 0)
		.reduce<TShard | undefined>(
			(best, shard) =>
				!best ||
				(shard.pool.size + shard.provisioning) / shard.target <
					(best.pool.size + best.provisioning) / best.target
					? shard
					: best,
			undefined,
		);
