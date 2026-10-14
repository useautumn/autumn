import { CE_LAKE_TABLES } from "@autumn/ducklake/ceLakeTables";
import { CE_BALANCES_CACHE_PROJECTION } from "@autumn/shared";
import { GetTableCommand, GlueClient } from "@aws-sdk/client-glue";
import { sql } from "drizzle-orm";
import type { Logger } from "../logtail/logtailUtils.js";
import { withMotherDuckRw } from "./initMotherDuck.js";

const GLUE_REGION = process.env.LAKE_GLUE_REGION ?? "us-east-2";
const GLUE_DATABASE = "internal";

const metadataLocationPattern = (table: string) =>
	new RegExp(
		`^s3://autumn-lake-prod-us-east-2/internal/${table}/[A-Za-z0-9/_.-]+\\.metadata\\.json$`,
	);

const glueClient = new GlueClient({ region: GLUE_REGION });

export const LIVE_LOOSE_BALANCE_CACHE_PREDICATE =
	"b.balance != 0 OR b.unlimited IS TRUE OR a.feature_type = 'boolean'";

export const getCurrentLakeMetadataLocation = async ({
	table,
}: {
	table: string;
}): Promise<string> => {
	const response = await glueClient.send(
		new GetTableCommand({ DatabaseName: GLUE_DATABASE, Name: table }),
	);
	const location = response.Table?.Parameters?.metadata_location;
	if (!location || !metadataLocationPattern(table).test(location)) {
		throw new Error(
			`[refreshCeBalancesCache] unexpected metadata_location from Glue for ${table}: ${location}`,
		);
	}
	return location;
};

export const ceBalanceTotalsSql = ({
	ceMetadataLocations,
	totalsTable = "ce_balance_totals",
}: {
	ceMetadataLocations: string[];
	totalsTable?: string;
}): string => `
	CREATE OR REPLACE TABLE main.${totalsTable} AS
	WITH b AS (
		${ceMetadataLocations
			.map(
				(location) => `SELECT ${CE_BALANCES_CACHE_PROJECTION}
		FROM iceberg_scan('${location}')`,
			)
			.join("\n\t\tUNION ALL\n\t\t")}
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
	LEFT JOIN main.ent_allowances a ON a.id = b.entitlement_id
	WHERE (b.expires_at IS NULL OR b.expires_at > epoch_ms(now()))
		AND (
			(
				b.customer_product_id IS NULL
				AND (${LIVE_LOOSE_BALANCE_CACHE_PREDICATE})
			)
			OR b.customer_product_id IN (SELECT id FROM main.cp_active)
		)
	GROUP BY 1, 2
	ORDER BY b.internal_feature_id, is_unlimited DESC, total DESC
`;

let inFlight: Promise<void> | null = null;

export const refreshCeBalancesCache = async ({
	logger,
	totalsTable,
}: {
	logger: Logger;
	totalsTable?: string;
}): Promise<{ ok: boolean }> => {
	if (inFlight) {
		logger.info(
			"[refreshCeBalancesCache] previous refresh still running — skipping tick",
		);
		return { ok: true };
	}

	inFlight = (async () => {
		const startedAt = performance.now();
		const [
			ceMetadataLocations,
			entMetadataLocation,
			cpMetadataLocation,
			featureMetadataLocation,
		] = await Promise.all([
			Promise.all(
				CE_LAKE_TABLES.map((table) =>
					getCurrentLakeMetadataLocation({ table }),
				),
			),
			getCurrentLakeMetadataLocation({ table: "entitlements" }),
			getCurrentLakeMetadataLocation({ table: "customer_products" }),
			getCurrentLakeMetadataLocation({ table: "features" }),
		]);

		const rowCount = await withMotherDuckRw({
			run: async (db) => {
				await db.execute(
					sql.raw(`
						CREATE OR REPLACE TABLE main.ent_allowances AS
						SELECT e.id, e.allowance, f.type AS feature_type
						FROM iceberg_scan('${entMetadataLocation}') e
						JOIN iceberg_scan('${featureMetadataLocation}') f
							ON f.internal_id = e.internal_feature_id
					`),
				);
				await db.execute(
					sql.raw(`
						CREATE OR REPLACE TABLE main.cp_active AS
						SELECT id
						FROM iceberg_scan('${cpMetadataLocation}')
						WHERE status IN ('active', 'past_due')
					`),
				);
				await db.execute(
					sql.raw(ceBalanceTotalsSql({ ceMetadataLocations, totalsTable })),
				);
				const countResult = (await db.execute(
					sql.raw(
						`SELECT COUNT(*) AS n FROM main.${totalsTable ?? "ce_balance_totals"}`,
					),
				)) as unknown as
					| { n: number | string }[]
					| { rows: { n: number | string }[] };
				const first = Array.isArray(countResult)
					? countResult[0]
					: countResult.rows?.[0];
				return Number(first?.n ?? 0);
			},
		});

		logger.info(
			{
				type: "md_cache_refresh",
				rowCount,
				metadataLocations: Object.fromEntries(
					CE_LAKE_TABLES.map((table, i) => [table, ceMetadataLocations[i]]),
				),
				durationMs: Math.round(performance.now() - startedAt),
			},
			"[refreshCeBalancesCache] rebuilt balance cache tables (rowCount = totals rows)",
		);
	})();

	try {
		await inFlight;
		return { ok: true };
	} catch (error) {
		logger.error(
			{ type: "md_cache_refresh_failed", error: String(error) },
			"[refreshCeBalancesCache] refresh failed",
		);
		return { ok: false };
	} finally {
		inFlight = null;
	}
};
