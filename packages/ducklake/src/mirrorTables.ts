import { SCRATCH_BASE } from "./buildCeBalanceTotals.js";
import { getLakeMetadataLocation } from "./lakeMetadata.js";
import type { DuckDbConnection } from "./localDuckDb.js";

export const HOT_MIRROR_TABLES = [
	"invoices",
	"customers",
	"organizations",
	"products",
	"customer_products",
] as const;

export const COLD_MIRROR_TABLES = [
	"prices",
	"features",
	"entitlements",
	"invoice_line_items",
	"customer_prices",
	"customer_entitlements",
] as const;

export type MirrorParquet = {
	table: string;
	parquetUrl: string;
	snapshot: string;
};

export const buildMirrorParquet = async ({
	connection,
	table,
	runId,
}: {
	connection: DuckDbConnection;
	table: string;
	runId: string;
}): Promise<MirrorParquet> => {
	const meta = await getLakeMetadataLocation({ table });
	const snapshot =
		meta.match(/\/(\d+)[^/]*\.metadata\.json$/)?.[1] ?? "unknown";
	const parquetUrl = `${SCRATCH_BASE}/${runId}/${table}.parquet`;
	await connection.run(`
		COPY (SELECT * FROM iceberg_scan('${meta}'))
		TO '${parquetUrl}' (FORMAT PARQUET, COMPRESSION ZSTD)
	`);
	return { table, parquetUrl, snapshot };
};
