export const CE_LAKE_SHARD_COUNT = 8;
export const CE_LAKE_SHARD_PREFIX = "customer_entitlements_s";

/** RisingWave's disjoint hash shards of customer_entitlements; their union is the table.
 * To reshard, build and verify the new shard set first, then change the count and prefix. */
export const CE_LAKE_TABLES: readonly string[] = Array.from(
	{ length: CE_LAKE_SHARD_COUNT },
	(_, shard) => `${CE_LAKE_SHARD_PREFIX}${shard}`,
);
