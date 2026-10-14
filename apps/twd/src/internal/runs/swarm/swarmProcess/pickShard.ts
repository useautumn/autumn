export type ShardDemand = {
	files: string[];
	started: number;
	target: number;
	provisioning: number;
	pool: { size: number };
	dedicated: boolean;
	filesPerWorker?: number;
	maxWorkers?: number;
};

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
