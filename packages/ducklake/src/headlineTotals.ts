/** Verbatim port of the hot flight's rollup. Runs ON MotherDuck at ingest
 * time because fx_rates exists only there (the fx flight writes it directly).
 * `sourceName` maps table names through the shadow suffix; fx_rates is always
 * the real table. */
export const headlineTotalsSql = ({
	targetTable,
	sourceName,
}: {
	targetTable: string;
	sourceName: (table: string) => string;
}): string => `
	CREATE OR REPLACE TABLE lake_cache.main."${targetTable}" AS
	WITH base AS (
		SELECT i.total / coalesce(fx.per_usd, 1) AS usd, i.created_at
		FROM lake_cache.main."${sourceName("invoices")}" i
		JOIN lake_cache.main."${sourceName("customers")}" c ON c.internal_id = i.internal_customer_id
		JOIN lake_cache.main."${sourceName("organizations")}" o ON o.id = c.org_id
		LEFT JOIN lake_cache.main.fx_rates fx ON fx.currency = lower(i.currency)
		WHERE c.env = 'live' AND i.status = 'paid'
			AND i.hosted_invoice_url LIKE '%live%'
			AND o.slug NOT IN ('welcome-back-1747670264')
	)
	SELECT * FROM (
		SELECT 'l30d' AS period, SUM(usd) AS volume, count(*) AS invoices FROM base
			WHERE created_at >= extract(epoch FROM now() - INTERVAL 30 DAY) * 1000
		UNION ALL
		SELECT 'ytd', SUM(usd), count(*) FROM base
			WHERE created_at >= extract(epoch FROM date_trunc('year', now())) * 1000
		UNION ALL
		SELECT 'all', SUM(usd), count(*) FROM base
	)
`;
