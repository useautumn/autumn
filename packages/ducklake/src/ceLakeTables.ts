export const CE_LAKE_TABLES: readonly string[] = ["customer_entitlements"];

/** RisingWave's disjoint hash shards of customer_entitlements; their union is the table.
 * Cut over by setting `LAKE_CE_TABLES` to these names, comma-separated. */
export const CE_LAKE_SHARD_TABLES: readonly string[] = Array.from(
	{ length: 8 },
	(_, shard) => `customer_entitlements_s${shard}`,
);

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
	// A repeated shard would be scanned twice and double-count its balances.
	if (new Set(tables).size !== tables.length) {
		throw new Error(`LAKE_CE_TABLES has duplicate table names: "${override}"`);
	}
	return tables;
};
