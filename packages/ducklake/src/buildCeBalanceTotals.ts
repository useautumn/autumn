import { getLakeMetadataLocation } from "./lakeMetadata.js";
import type { DuckDbConnection } from "./localDuckDb.js";

/** Scratch lives INSIDE internal/ so MotherDuck's `lake_s3` secret (scoped to
 * internal/*) can read_parquet it back out. Lifecycle rule expires it daily. */
export const SCRATCH_BASE =
	"s3://autumn-lake-prod-us-east-2/internal/lake-cache-scratch";

/** Semantics are a verbatim port of the server cron's totals CTAS
 * (refreshCeBalancesCache.ts) which this job replaces: finite-only
 * remaining/granted, all-rows usage incl. entity-held unlimited deductions,
 * finite_rows guard column, zone-map-friendly ordering. */
const ceBalanceTotalsSql = ({
	ceMeta,
	entMeta,
	featureMeta,
	cpMeta,
}: {
	ceMeta: string;
	entMeta: string;
	featureMeta: string;
	cpMeta: string;
}): string => `
	WITH b AS (
		SELECT
			internal_customer_id,
			internal_feature_id,
			balance,
			expires_at,
			unlimited,
			entitlement_id,
			adjustment,
			customer_product_id,
			CASE WHEN json_type(TRY_CAST(entities AS JSON)) = 'OBJECT'
				THEN COALESCE(list_sum(list_transform(json_keys(entities),
					k -> CAST(json_extract(entities, '$."' || k || '".balance') AS DOUBLE))), 0)
				ELSE 0
			END AS entities_balance
		FROM iceberg_scan('${ceMeta}')
	),
	a AS (
		SELECT e.id, e.allowance, f.type AS feature_type
		FROM iceberg_scan('${entMeta}') e
		JOIN iceberg_scan('${featureMeta}') f ON f.internal_id = e.internal_feature_id
	),
	cp_active AS (
		SELECT id FROM iceberg_scan('${cpMeta}') WHERE status IN ('active', 'past_due')
	)
	SELECT
		b.internal_customer_id,
		b.internal_feature_id,
		COALESCE(BOOL_OR(b.unlimited), false) AS is_unlimited,
		COALESCE(SUM(b.balance) FILTER (WHERE b.unlimited IS NOT TRUE), 0) AS total,
		COALESCE(SUM(COALESCE(a.allowance, 0) + COALESCE(b.adjustment, 0))
			FILTER (WHERE b.unlimited IS NOT TRUE), 0) AS granted_total,
		COALESCE(SUM(CASE
			WHEN b.unlimited IS TRUE THEN -(COALESCE(b.balance, 0) + COALESCE(b.entities_balance, 0))
			ELSE COALESCE(a.allowance, 0) + COALESCE(b.adjustment, 0) - COALESCE(b.balance, 0)
		END), 0) AS usage_total,
		COUNT(*) FILTER (WHERE b.unlimited IS NOT TRUE) AS finite_rows
	FROM b
	LEFT JOIN a ON a.id = b.entitlement_id
	WHERE (b.expires_at IS NULL OR b.expires_at > epoch_ms(now()))
		AND (
			(
				b.customer_product_id IS NULL
				AND (b.balance != 0 OR b.unlimited IS TRUE OR a.feature_type = 'boolean')
			)
			OR b.customer_product_id IN (SELECT id FROM cp_active)
		)
	GROUP BY 1, 2
	ORDER BY b.internal_feature_id, is_unlimited DESC, total DESC
`;

/** Scans the lake in-region and writes the totals parquet to scratch.
 * Returns the parquet URL the MotherDuck ingest should read. */
export const buildCeBalanceTotalsParquet = async ({
	connection,
	runId,
}: {
	connection: DuckDbConnection;
	runId: string;
}): Promise<{ parquetUrl: string }> => {
	const [ceMeta, entMeta, featureMeta, cpMeta] = await Promise.all([
		getLakeMetadataLocation({ table: "customer_entitlements" }),
		getLakeMetadataLocation({ table: "entitlements" }),
		getLakeMetadataLocation({ table: "features" }),
		getLakeMetadataLocation({ table: "customer_products" }),
	]);

	const parquetUrl = `${SCRATCH_BASE}/${runId}/ce_balance_totals.parquet`;
	await connection.run(`
		COPY (${ceBalanceTotalsSql({ ceMeta, entMeta, featureMeta, cpMeta })})
		TO '${parquetUrl}' (FORMAT PARQUET, COMPRESSION ZSTD)
	`);
	return { parquetUrl };
};
