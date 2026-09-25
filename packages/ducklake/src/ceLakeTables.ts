/** RisingWave sinks customer_entitlements as disjoint hash shards; their union is the table. */
export const CE_LAKE_TABLES: readonly string[] = Array.from(
	{ length: 8 },
	(_, shard) => `customer_entitlements_s${shard}`,
);

/** `LAKE_CE_TABLES` (comma-separated) overrides the shards for a reshard or a
 * rollback to the single `customer_entitlements` table. */
export const getCeLakeTables = ({
	override = process.env.LAKE_CE_TABLES,
}: {
	override?: string;
} = {}): readonly string[] => {
	if (override === undefined || override === "") return CE_LAKE_TABLES;

	const tables = override
		.split(",")
		.map((table) => table.trim())
		.filter(Boolean);
	if (tables.length === 0) {
		throw new Error(`LAKE_CE_TABLES has no table names: "${override}"`);
	}
	return tables;
};
