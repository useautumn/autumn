export type ShardDemand = {
	files: string[];
	started: number;
	/** Planned share of the run's workers. */
	target: number;
	provisioning: number;
	pool: { size: number };
	/** Runs on its own Stripe account, so pool accounts never join it. */
	dedicated: boolean;
};

/** The pooled shard that can still use a worker and is furthest below its planned share. */
export const pickShard = <TShard extends ShardDemand>(
	shards: TShard[],
): TShard | undefined =>
	shards
		.filter(
			(shard) =>
				!shard.dedicated &&
				shard.files.length - shard.started >
					shard.pool.size + shard.provisioning,
		)
		.reduce<TShard | undefined>(
			(best, shard) =>
				!best ||
				(shard.pool.size + shard.provisioning) / shard.target <
					(best.pool.size + best.provisioning) / best.target
					? shard
					: best,
			undefined,
		);
