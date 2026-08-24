import { SCRATCH_BASE } from "./buildCeBalanceTotals.js";
import { getLakeMetadataLocation } from "./lakeMetadata.js";
import type { DuckDbConnection } from "./localDuckDb.js";

/** Full-copy mirrors consumed by the revenue dives. Cold tables join this
 * list in phase 3. */
export const HOT_MIRROR_TABLES = [
	"invoices",
	"customers",
	"organizations",
	"products",
	"customer_products",
] as const;

export type MirrorParquet = {
	table: string;
	parquetUrl: string;
	/** Numeric prefix of the metadata filename — cosmetic version label the
	 * dashboards' refresh_status rows carry. */
	snapshot: string;
};

/** SELECT * so the type fingerprint (DECIMAL(38,10), epoch-ms, VARCHAR[])
 * survives untouched — dive arithmetic depends on it. */
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
