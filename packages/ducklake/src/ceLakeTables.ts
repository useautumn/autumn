export const CE_LAKE_SHARD_COUNT = 8;
export const CE_LAKE_SHARD_PREFIX = "customer_entitlements_s";

export const CE_LAKE_TABLES: readonly string[] = Array.from(
	{ length: CE_LAKE_SHARD_COUNT },
	(_, shard) => `${CE_LAKE_SHARD_PREFIX}${shard}`,
);
