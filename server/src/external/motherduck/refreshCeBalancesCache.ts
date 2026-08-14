import { CE_BALANCES_CACHE_PROJECTION } from "@autumn/shared";
import { GetTableCommand, GlueClient } from "@aws-sdk/client-glue";
import { sql } from "drizzle-orm";
import type { Logger } from "../logtail/logtailUtils.js";
import { withMotherDuckRw } from "./initMotherDuck.js";

const GLUE_REGION = process.env.LAKE_GLUE_REGION ?? "us-east-2";
const GLUE_DATABASE = "internal";

/** metadata_location is interpolated into SQL (DDL can't take bind params),
 * so it must match the lake's exact shape before we trust it. */
const metadataLocationPattern = (table: string) =>
	new RegExp(
		`^s3://autumn-lake-prod-us-east-2/internal/${table}/[A-Za-z0-9/_.-]+\\.metadata\\.json$`,
	);

const glueClient = new GlueClient({ region: GLUE_REGION });

/** The Glue pointer advances on every RW sink commit — always read it fresh;
 * a pinned metadata.json 404s within hours once compaction expires it. */
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

let inFlight: Promise<void> | null = null;

export const refreshCeBalancesCache = async ({
	logger,
}: {
	logger: Logger;
}): Promise<void> => {
	if (inFlight) {
		logger.info(
			"[refreshCeBalancesCache] previous refresh still running — skipping tick",
		);
		return;
	}

	inFlight = (async () => {
		const startedAt = performance.now();
		const [ceMetadataLocation, entMetadataLocation, cpMetadataLocation] =
			await Promise.all([
				getCurrentLakeMetadataLocation({ table: "customer_entitlements" }),
				getCurrentLakeMetadataLocation({ table: "entitlements" }),
				getCurrentLakeMetadataLocation({ table: "customer_products" }),
			]);

		const rowCount = await withMotherDuckRw({
			run: async (db) => {
				await db.execute(
					sql.raw(`
						CREATE OR REPLACE TABLE main.ce_balances AS
						SELECT ${CE_BALANCES_CACHE_PROJECTION}
						FROM iceberg_scan('${ceMetadataLocation}')
					`),
				);
				await db.execute(
					sql.raw(`
						CREATE OR REPLACE TABLE main.ent_allowances AS
						SELECT id, allowance
						FROM iceberg_scan('${entMetadataLocation}')
					`),
				);
				// Statuses must mirror PG's ACTIVE_STATUSES — dead product-history
				// rows otherwise inflate every aggregate (granted by 10-30x).
				await db.execute(
					sql.raw(`
						CREATE OR REPLACE TABLE main.cp_active AS
						SELECT id
						FROM iceberg_scan('${cpMetadataLocation}')
						WHERE status IN ('active', 'past_due')
					`),
				);
				// Aggregate once here (~1s/feature at query time otherwise); expiry
				// is baked at refresh, which the 5-min staleness window already covers.
				// granted ≈ allowance + adjustment (quantity lives only in PG).
				// Sums cover FINITE rows only — unlimited rows contribute the flag,
				// not numbers (mixed unlimited+finite customers keep finite values).
				// The ORDER BY clusters row groups so per-feature top-N prunes.
				await db.execute(
					sql.raw(`
						CREATE OR REPLACE TABLE main.ce_balance_totals AS
						SELECT
							b.internal_customer_id,
							b.internal_feature_id,
							COALESCE(BOOL_OR(b.unlimited), false) AS is_unlimited,
							COALESCE(SUM(b.balance) FILTER (WHERE b.unlimited IS NOT TRUE), 0) AS total,
							COALESCE(SUM(COALESCE(a.allowance, 0) + COALESCE(b.adjustment, 0))
								FILTER (WHERE b.unlimited IS NOT TRUE), 0) AS granted_total
						FROM main.ce_balances b
						LEFT JOIN main.ent_allowances a ON a.id = b.entitlement_id
						WHERE (b.expires_at IS NULL OR b.expires_at > epoch_ms(now()))
							AND (
								b.customer_product_id IS NULL
								OR b.customer_product_id IN (SELECT id FROM main.cp_active)
							)
						GROUP BY 1, 2
						ORDER BY b.internal_feature_id, is_unlimited DESC, total DESC
					`),
				);
				const countResult = (await db.execute(
					sql`SELECT COUNT(*) AS n FROM main.ce_balances`,
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
				metadataLocation: ceMetadataLocation,
				durationMs: Math.round(performance.now() - startedAt),
			},
			"[refreshCeBalancesCache] rebuilt lake_cache.main.ce_balances",
		);
	})();

	try {
		await inFlight;
	} catch (error) {
		logger.error(
			{ type: "md_cache_refresh_failed", error: String(error) },
			"[refreshCeBalancesCache] refresh failed",
		);
	} finally {
		inFlight = null;
	}
};
