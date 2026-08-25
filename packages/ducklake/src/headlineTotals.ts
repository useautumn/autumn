/** Verbatim port of the hot flight's rollup. Authored here, EXECUTED on
 * MotherDuck: the string is sent over the ingest session's connection because
 * its inputs (fx_rates + the just-swapped mirrors) only exist in MotherDuck —
 * unlike the scan SQL, which runs on the local embedded engine. `sourceName`
 * maps mirror names through the shadow suffix; fx_rates is always real. */
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
