type CullableShard = { dedicated: boolean; pool: { size: number } };

/** Start the tail cull on each pooled shard once it has live workers; the dedicated shard is one worker. */
export const startIdleCulling = <Shard extends CullableShard>({
	shards,
	culling,
	startCulling,
}: {
	shards: Shard[];
	culling: Map<Shard, () => void>;
	startCulling: (shard: Shard) => () => void;
}) => {
	for (const shard of shards) {
		if (shard.dedicated || shard.pool.size === 0 || culling.has(shard))
			continue;
		culling.set(shard, startCulling(shard));
	}
};
