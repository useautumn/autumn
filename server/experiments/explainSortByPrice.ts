import { AppEnv, BillingInterval, RELEVANT_STATUSES } from "@autumn/shared";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
// Import initDrizzle directly — avoid `experimentEnv` because its
// `loadLocalEnv()` reads `server/.env` and clobbers env vars injected by
// `infisical run --env=staging` (e.g. DATABASE_URL).
import { initDrizzle } from "../src/db/initDrizzle";
import { getCursorPaginatedFullCusQuery } from "../src/internal/customers/cursorPaginatedFullCusQuery";

const prodTestOrgId = (() => {
	const v = process.env.PROD_TEST_ORG_ID;
	if (!v) throw new Error("PROD_TEST_ORG_ID env var is required");
	return v;
})();

// Mask password but show host so we can verify which DB we're hitting.
const dbUrl = process.env.DATABASE_URL ?? "";
console.log(
	"DATABASE URL host:",
	dbUrl.replace(/:\/\/[^@]+@/, "://***:***@") || "(empty)",
);

// To run against a remote env (e.g. staging) via infisical:
//   infisical run --env=staging --recursive -- bun run server/experiments/explainSortByPrice.ts

// ─── Configuration ──────────────────────────────────────────────────
const ORG_ID = prodTestOrgId;
const ENV = AppEnv.Live;
const PAGE_LIMIT = 50;
const REPEATS = 5;
const DEEP_OFFSET_PCT = 45;
const STATEMENT_TIMEOUT_MS = 30_000;
const TRUNCATE_EXPLAIN = true;
const EXPLAIN_MAX_LINES = 30;
const CUS_PRODUCT_LIMIT = 3; // matches DASHBOARD_LIST_PRODUCT_PREVIEW_LIMIT
// ═════════════════════════════════════════════════════════════════════

type DB = ReturnType<typeof initDrizzle>["db"];

const MONTHLY_FACTORS: Partial<Record<BillingInterval, number>> = {
	[BillingInterval.Week]: 52 / 12,
	[BillingInterval.Month]: 1,
	[BillingInterval.Quarter]: 1 / 3,
	[BillingInterval.SemiAnnual]: 1 / 6,
	[BillingInterval.Year]: 1 / 12,
};

const dialect = new PgDialect();

const inlineParams = (text: string, params: readonly unknown[]): string =>
	text.replace(/\$(\d+)/g, (_, n) => {
		const v = params[Number(n) - 1];
		if (v === null || v === undefined) return "NULL";
		if (typeof v === "number" || typeof v === "boolean") return String(v);
		return `'${String(v).replace(/'/g, "''")}'`;
	});

const printSqlQuery = ({ query, label }: { query: SQL; label: string }) => {
	const { sql: text, params } = dialect.sqlToQuery(query);
	console.log(`\n--- SQL: ${label} ---`);
	console.log(inlineParams(text, params));
};

const truncateExplainText = (text: string, maxLines: number): string => {
	const lines = text.split("\n");
	if (lines.length <= maxLines) return text;
	return [
		...lines.slice(0, maxLines),
		`... (${lines.length - maxLines} more lines truncated)`,
	].join("\n");
};

const normalizeRows = (r: unknown): Record<string, unknown>[] => {
	if (Array.isArray(r)) return r as Record<string, unknown>[];
	if (r && typeof r === "object" && "rows" in r) {
		return (r as { rows: Record<string, unknown>[] }).rows;
	}
	return [];
};

const runReadOnly = async ({
	db,
	query,
}: {
	db: DB;
	query: SQL;
}): Promise<Record<string, unknown>[]> => {
	return await db.transaction(async (tx) => {
		await tx.execute(
			sql.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`),
		);
		await tx.execute(sql.raw("SET LOCAL transaction_read_only = on"));
		return normalizeRows(await tx.execute(query));
	});
};

const printExplainPlan = async ({
	db,
	query,
	label,
}: {
	db: DB;
	query: SQL;
	label: string;
}) => {
	console.log(`\n--- EXPLAIN ANALYZE: ${label} ---`);
	try {
		const rows = await runReadOnly({
			db,
			query: sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}`,
		});
		const joined = rows.map((row) => String(row["QUERY PLAN"])).join("\n");
		console.log(
			TRUNCATE_EXPLAIN
				? truncateExplainText(joined, EXPLAIN_MAX_LINES)
				: joined,
		);
	} catch (err) {
		console.log(`EXPLAIN failed: ${err instanceof Error ? err.message : err}`);
	}
};

const measure = async ({
	db,
	label,
	query,
	printSql = true,
	explain = true,
}: {
	db: DB;
	label: string;
	query: SQL;
	printSql?: boolean;
	explain?: boolean;
}): Promise<Record<string, unknown>[]> => {
	console.log(`\n=== ${label} ===`);
	if (printSql) printSqlQuery({ query, label });

	// Warmup
	await runReadOnly({ db, query });

	const samples: number[] = [];
	let rows: Record<string, unknown>[] = [];
	for (let i = 0; i < REPEATS; i++) {
		const startedAt = performance.now();
		rows = await runReadOnly({ db, query });
		samples.push(performance.now() - startedAt);
	}
	samples.sort((a, b) => a - b);
	const p50 = samples[Math.floor(samples.length / 2)];
	console.log(
		`Rows: ${rows.length}  p50=${p50.toFixed(1)}ms  min=${samples[0].toFixed(1)}ms  max=${samples[samples.length - 1].toFixed(1)}ms  (${REPEATS} repeats, warm)`,
	);

	if (explain) await printExplainPlan({ db, query, label });
	return rows;
};

// ─── Price prefetch (the "TS-side normalization" leg) ───────────────

type PriceMapEntry = { priceId: string; monthlyAmount: number };

const prefetchPriceMap = async ({
	db,
}: {
	db: DB;
}): Promise<{ entries: PriceMapEntry[]; totalPrices: number; skipped: number }> => {
	const startedAt = performance.now();
	const rows = await runReadOnly({
		db,
		query: sql`
			SELECT p.id, p.config
			FROM prices p
			WHERE p.org_id = ${ORG_ID}
				AND p.config IS NOT NULL
		`,
	});
	const elapsed = performance.now() - startedAt;

	const entries: PriceMapEntry[] = [];
	let skipped = 0;
	for (const row of rows) {
		const config = row.config as {
			amount?: number;
			interval?: string;
			interval_count?: number;
		} | null;
		const factor = MONTHLY_FACTORS[config?.interval as BillingInterval];
		// Usage/tiered prices have no flat `amount`; one_off has no recurring factor.
		if (typeof config?.amount !== "number" || factor === undefined) {
			skipped++;
			continue;
		}
		const intervalCount = config.interval_count || 1;
		entries.push({
			priceId: String(row.id),
			monthlyAmount: (config.amount * factor) / intervalCount,
		});
	}

	console.log(
		`\nPrefetched ${rows.length} prices in ${elapsed.toFixed(1)}ms — ${entries.length} usable (fixed recurring), ${skipped} skipped (usage/one-off/no amount)`,
	);
	return { entries, totalPrices: rows.length, skipped };
};

// Inlined as raw literals: a torture org can have one custom price per
// customer, and parameterizing each VALUES row hits the 65534-param cap.
const buildPriceMapValuesSql = (entries: PriceMapEntry[]): SQL => {
	const rows = entries.map(
		(e) =>
			`('${e.priceId.replace(/'/g, "''")}', ${Number(e.monthlyAmount)})`,
	);
	return sql.raw(rows.join(", "));
};

// ─── Resolver variants ───────────────────────────────────────────────

const orgProductsSubquery = () => sql`
	SELECT prod.internal_id FROM products prod
	WHERE prod.org_id = ${ORG_ID} AND prod.env = ${ENV}
`;

const activeStatusList = () =>
	sql.join(
		RELEVANT_STATUSES.map((s) => sql`${s}`),
		sql`, `,
	);

/** Cell A: amounts pre-resolved in TS, inlined as a VALUES map. */
const buildValuesMapResolveQuery = ({
	entries,
	cursor,
}: {
	entries: PriceMapEntry[];
	cursor?: { total: number; internalId: string };
}): SQL => sql`
	WITH price_map(price_id, monthly_amount) AS (
		VALUES ${buildPriceMapValuesSql(entries)}
	),
	totals AS (
		SELECT cp.internal_customer_id, SUM(pm.monthly_amount) AS total
		FROM customer_products cp
		JOIN customer_prices cpr ON cpr.customer_product_id = cp.id
		JOIN price_map pm ON pm.price_id = cpr.price_id
		WHERE cp.internal_product_id IN (${orgProductsSubquery()})
			AND cp.status IN (${activeStatusList()})
		GROUP BY cp.internal_customer_id
	)
	SELECT t.internal_customer_id, t.total
	FROM totals t
	${
		cursor
			? sql`WHERE (t.total, t.internal_customer_id) < (${cursor.total}, ${cursor.internalId})`
			: sql``
	}
	ORDER BY t.total DESC, t.internal_customer_id DESC
	LIMIT ${PAGE_LIMIT + 1}
`;

const monthlyAmountExpr = () => sql`
	(p.config->>'amount')::numeric
	* CASE p.config->>'interval'
		WHEN 'week' THEN 52.0 / 12
		WHEN 'month' THEN 1
		WHEN 'quarter' THEN 1.0 / 3
		WHEN 'semi_annual' THEN 1.0 / 6
		WHEN 'year' THEN 1.0 / 12
		ELSE 0
	END
	/ GREATEST(COALESCE((p.config->>'interval_count')::numeric, 1), 1)
`;

const pageClause = (cursor?: { total: number; internalId: string }): SQL => sql`
	SELECT t.internal_customer_id, t.total
	FROM totals t
	${
		cursor
			? sql`WHERE (t.total, t.internal_customer_id) < (${cursor.total}, ${cursor.internalId})`
			: sql``
	}
	ORDER BY t.total DESC, t.internal_customer_id DESC
	LIMIT ${PAGE_LIMIT + 1}
`;

/** Cell B: cusProduct-driven — org products → customer_products → prices. */
const buildSqlSideResolveQuery = ({
	cursor,
}: {
	cursor?: { total: number; internalId: string };
}): SQL => sql`
	WITH totals AS (
		SELECT cp.internal_customer_id,
			SUM(${monthlyAmountExpr()}) AS total
		FROM customer_products cp
		JOIN customer_prices cpr ON cpr.customer_product_id = cp.id
		JOIN prices p ON p.id = cpr.price_id AND p.org_id = ${ORG_ID}
		WHERE cp.internal_product_id IN (${orgProductsSubquery()})
			AND cp.status IN (${activeStatusList()})
			AND p.config->>'amount' IS NOT NULL
		GROUP BY cp.internal_customer_id
	)
	${pageClause(cursor)}
`;

/** Cell B2: price-driven — prices (org+env-scoped via products, since prices
 * has no env column) → customer_prices → status probe on customer_products. */
const buildPriceDrivenResolveQuery = ({
	cursor,
}: {
	cursor?: { total: number; internalId: string };
}): SQL => sql`
	WITH totals AS (
		SELECT cp.internal_customer_id,
			SUM(${monthlyAmountExpr()}) AS total
		FROM prices p
		JOIN customer_prices cpr ON cpr.price_id = p.id
		JOIN customer_products cp ON cp.id = cpr.customer_product_id
			AND cp.status IN (${activeStatusList()})
		WHERE p.org_id = ${ORG_ID}
			AND p.internal_product_id IN (${orgProductsSubquery()})
			AND p.config->>'amount' IS NOT NULL
		GROUP BY cp.internal_customer_id
	)
	${pageClause(cursor)}
`;

/** Cell C: no customer_products hop at all — includes churned customers.
 * Wrong results, but bounds what the status filter costs. */
const buildNoStatusResolveQuery = (): SQL => sql`
	WITH totals AS (
		SELECT cpr.internal_customer_id,
			SUM(${monthlyAmountExpr()}) AS total
		FROM customer_prices cpr
		JOIN prices p ON p.id = cpr.price_id AND p.org_id = ${ORG_ID}
		WHERE cpr.internal_customer_id IS NOT NULL
			AND p.config->>'amount' IS NOT NULL
		GROUP BY cpr.internal_customer_id
	)
	${pageClause()}
`;

/** Unlimited totals for deep-cursor manufacture — the page queries are
 * LIMITed, so offsetting into them would find nothing past one page. */
const buildTotalsForDeepCursor = (): SQL => sql`
	SELECT cp.internal_customer_id, SUM(${monthlyAmountExpr()}) AS total
	FROM prices p
	JOIN customer_prices cpr ON cpr.price_id = p.id
	JOIN customer_products cp ON cp.id = cpr.customer_product_id
		AND cp.status IN (${activeStatusList()})
	WHERE p.org_id = ${ORG_ID}
		AND p.internal_product_id IN (${orgProductsSubquery()})
		AND p.config->>'amount' IS NOT NULL
	GROUP BY cp.internal_customer_id
`;

const resolveDeepCursor = async ({
	db,
	deepOffset,
}: {
	db: DB;
	deepOffset: number;
}): Promise<{ total: number; internalId: string } | null> => {
	const rows = await runReadOnly({
		db,
		query: sql`
			SELECT * FROM (${buildTotalsForDeepCursor()}) totals
			ORDER BY total DESC, internal_customer_id DESC
			LIMIT 1 OFFSET ${deepOffset}
		`,
	});
	const row = rows[0] as
		| { internal_customer_id: string; total: string | number }
		| undefined;
	if (!row) return null;
	return { total: Number(row.total), internalId: row.internal_customer_id };
};

// ─── Main ────────────────────────────────────────────────────────────

const main = async () => {
	const replicaUrl = process.env.DATABASE_REPLICA_URL;
	const usingReplica = Boolean(replicaUrl);
	if (!usingReplica) {
		console.warn(
			"DATABASE_REPLICA_URL not set — falling back to DATABASE_URL (primary).",
		);
	}
	const { db, client } = initDrizzle({ replica: usingReplica });

	try {
		console.log(
			`=== SORT BY PRICE (keyset resolver) EXPERIMENT (${usingReplica ? "REPLICA" : "PRIMARY"}) ===`,
		);
		console.log(
			JSON.stringify(
				{ ORG_ID, ENV, PAGE_LIMIT, REPEATS, DEEP_OFFSET_PCT },
				null,
				2,
			),
		);

		// Context stats
		const stats = await runReadOnly({
			db,
			query: sql`
				SELECT
					(SELECT COUNT(*)::int FROM customers c WHERE c.org_id = ${ORG_ID} AND c.env = ${ENV}) AS customers,
					(SELECT COUNT(*)::int FROM prices p WHERE p.org_id = ${ORG_ID}) AS prices,
					(SELECT COUNT(*)::int FROM customer_products cp
						WHERE cp.internal_product_id IN (${orgProductsSubquery()})
							AND cp.status IN (${activeStatusList()})) AS active_cus_products
			`,
		});
		console.log(`\nOrg stats: ${JSON.stringify(stats[0])}`);

		// ── Cell A: VALUES map (TS-side amounts) ──
		const { entries } = await prefetchPriceMap({ db });
		if (entries.length === 0) {
			console.error("No usable fixed recurring prices for this org — aborting.");
			process.exit(1);
		}

		const valuesQuery = buildValuesMapResolveQuery({ entries });
		const pageA = await measure({
			db,
			label: `A: VALUES map resolve, first page (${entries.length} price entries inlined)`,
			query: valuesQuery,
			// A 100k-row VALUES list makes the printed SQL useless — skip it.
			printSql: entries.length <= 50,
		});

		// ── Cell B: SQL-side amounts (join prices, jsonb extraction) ──
		const sqlSideQuery = buildSqlSideResolveQuery({});
		const pageB = await measure({
			db,
			label: "B: SQL-side resolve, first page (join prices, amounts from config jsonb)",
			query: sqlSideQuery,
		});

		// ── Cell B2: price-driven join order ──
		const priceDrivenQuery = buildPriceDrivenResolveQuery({});
		const pageB2 = await measure({
			db,
			label:
				"B2: price-driven resolve, first page (prices → customer_prices → status probe)",
			query: priceDrivenQuery,
		});

		// Sanity: all variants should agree on the top page.
		const idsA = pageA.map((r) => r.internal_customer_id).join(",");
		const idsB = pageB.map((r) => r.internal_customer_id).join(",");
		const idsB2 = pageB2.map((r) => r.internal_customer_id).join(",");
		console.log(
			`\nVariant agreement (first page ids): A vs B ${idsA === idsB ? "MATCH ✅" : "MISMATCH ❌"} | B vs B2 ${idsB === idsB2 ? "MATCH ✅" : "MISMATCH ❌"}`,
		);

		// ── Cell C: no-status-join variant (what does the churn filter cost?) ──
		await measure({
			db,
			label: "C: SQL-side resolve WITHOUT customer_products status join (includes churned)",
			query: buildNoStatusResolveQuery(),
		});

		// ── Cell D: deep cursor page on the price-driven variant ──
		const fullCount = await runReadOnly({
			db,
			query: sql`
				SELECT COUNT(DISTINCT cp.internal_customer_id)::int AS n
				FROM customer_products cp
				JOIN customer_prices cpr ON cpr.customer_product_id = cp.id
				WHERE cp.internal_product_id IN (${orgProductsSubquery()})
					AND cp.status IN (${activeStatusList()})
			`,
		});
		const totalPaying = Number((fullCount[0] as { n: number }).n);
		const deepOffset = Math.floor((totalPaying * DEEP_OFFSET_PCT) / 100);
		console.log(
			`\nPaying customers: ${totalPaying.toLocaleString()} — deep offset ${deepOffset.toLocaleString()} (${DEEP_OFFSET_PCT}%)`,
		);

		const deepCursor = await resolveDeepCursor({
			db,
			deepOffset: Math.min(deepOffset, totalPaying - 1),
		});
		if (deepCursor) {
			await measure({
				db,
				label: `D: price-driven resolve, deep page (cursor total=${deepCursor.total.toFixed(2)})`,
				query: buildPriceDrivenResolveQuery({ cursor: deepCursor }),
				printSql: false,
			});
		} else {
			console.log("\nD: skipped — could not resolve a deep cursor.");
		}

		// ── Cell E: end-to-end — resolve page then hydrate via fetchset ──
		console.log(
			"\n=== E: end-to-end (resolve + getCursorPaginatedFullCusQuery hydration) ===",
		);
		{
			// Warmup
			const warmIds = pageB2
				.slice(0, PAGE_LIMIT)
				.map((r) => String(r.internal_customer_id));
			await runReadOnly({
				db,
				query: getCursorPaginatedFullCusQuery({
					orgId: ORG_ID,
					env: ENV,
					inStatuses: RELEVANT_STATUSES,
					withSubs: true,
					withEntities: true,
					includeInvoices: true,
					withProductsPage: true,
					limit: warmIds.length,
					internalCustomerIds: warmIds,
					cusProductLimit: CUS_PRODUCT_LIMIT,
				}),
			});

			const samples: { resolve: number; fetch: number }[] = [];
			for (let i = 0; i < REPEATS; i++) {
				const t0 = performance.now();
				const page = await runReadOnly({
					db,
					query: buildPriceDrivenResolveQuery({}),
				});
				const t1 = performance.now();
				const ids = page
					.slice(0, PAGE_LIMIT)
					.map((r) => String(r.internal_customer_id));
				await runReadOnly({
					db,
					query: getCursorPaginatedFullCusQuery({
						orgId: ORG_ID,
						env: ENV,
						inStatuses: RELEVANT_STATUSES,
						withSubs: true,
						withEntities: true,
						includeInvoices: true,
						withProductsPage: true,
						limit: ids.length,
						internalCustomerIds: ids,
						cusProductLimit: CUS_PRODUCT_LIMIT,
					}),
				});
				samples.push({ resolve: t1 - t0, fetch: performance.now() - t1 });
			}
			const p50 = (xs: number[]) =>
				[...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
			const resolveP50 = p50(samples.map((s) => s.resolve));
			const fetchP50 = p50(samples.map((s) => s.fetch));
			console.log(
				`resolve p50=${resolveP50.toFixed(1)}ms  fetch p50=${fetchP50.toFixed(1)}ms  total p50≈${(resolveP50 + fetchP50).toFixed(1)}ms  (page of ${PAGE_LIMIT}, dashboard-shaped hydration)`,
			);
		}

		console.log("\n✅ Done");
	} finally {
		await client.end();
		process.exit(0);
	}
};

await main();
