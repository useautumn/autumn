import { AppEnv } from "@autumn/shared";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
// Import initDrizzle directly — avoid `experimentEnv` because its
// `loadLocalEnv()` reads `server/.env` and clobbers env vars injected by
// `infisical run --env=prod` (e.g. DATABASE_URL).
import { initDrizzle } from "../src/db/initDrizzle";

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

// Run with:
//   infisical run --env=prod --recursive -- bun run server/experiments/explainSortByFeatureBalance.ts
// Optionally set PROD_TEST_FEATURE_ID to pin the feature; otherwise the org's
// most-entitled metered feature is auto-picked.

// ─── Configuration ──────────────────────────────────────────────────
const ORG_ID = prodTestOrgId;
const ENV = AppEnv.Live;
const FEATURE_ID = process.env.PROD_TEST_FEATURE_ID || undefined;
const PAGE_LIMIT = 50;
const REPEATS = 5;
const DEEP_OFFSET_PCT = 45;
const STATEMENT_TIMEOUT_MS = 30_000;
const TRUNCATE_EXPLAIN = true;
const EXPLAIN_MAX_LINES = 30;
const CUS_PRODUCT_LIMIT = 3; // matches DASHBOARD_LIST_PRODUCT_PREVIEW_LIMIT
// ═════════════════════════════════════════════════════════════════════

type DB = ReturnType<typeof initDrizzle>["db"];

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
			TRUNCATE_EXPLAIN ? truncateExplainText(joined, EXPLAIN_MAX_LINES) : joined,
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

// ─── Feature selection ───────────────────────────────────────────────

type FeatureRow = {
	internal_id: string;
	id: string;
	cus_ent_count: number;
};

/** Auto-pick the org feature with the most cusEnt rows (capped counts so a
 * whale feature doesn't make selection itself expensive). */
const pickFeature = async ({ db }: { db: DB }): Promise<FeatureRow> => {
	const rows = await runReadOnly({
		db,
		query: sql`
			SELECT
				f.internal_id,
				f.id,
				(
					SELECT COUNT(*)::int FROM (
						SELECT 1 FROM customer_entitlements ce
						WHERE ce.internal_feature_id = f.internal_id
						LIMIT 500000
					) capped
				) AS cus_ent_count
			FROM features f
			WHERE f.org_id = ${ORG_ID} AND f.env = ${ENV}
				AND f.type IN ('metered', 'credit_system')
			ORDER BY 3 DESC
		`,
	});
	const features = rows as unknown as FeatureRow[];
	if (FEATURE_ID) {
		const pinned = features.find((f) => f.id === FEATURE_ID);
		if (!pinned) throw new Error(`Feature ${FEATURE_ID} not found for org`);
		return pinned;
	}
	if (features.length === 0) {
		throw new Error("No metered/credit features for this org");
	}
	console.log(
		`\nFeatures by cusEnt count: ${features
			.slice(0, 8)
			.map((f) => `${f.id}=${Number(f.cus_ent_count).toLocaleString()}`)
			.join(", ")}`,
	);
	return features[0];
};

// ─── Resolver query ──────────────────────────────────────────────────

// Excludes: expired cusEnts (denormalized parent-product expiry), lapsed loose
// entitlements, and pooled contributions (their balance lives on the pool row).
const balanceTotalsCte = ({
	internalFeatureId,
}: {
	internalFeatureId: string;
}): SQL => sql`
	SELECT ce.internal_customer_id, SUM(ce.balance) AS total
	FROM customer_entitlements ce
	WHERE ce.internal_feature_id = ${internalFeatureId}
		AND ce.expired IS NOT TRUE
		AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
		AND ce.pooled_contribution_id IS NULL
	GROUP BY ce.internal_customer_id
`;

const buildBalanceSortQuery = ({
	internalFeatureId,
	cursor,
	sortDesc = true,
}: {
	internalFeatureId: string;
	cursor?: { total: number; internalId: string };
	sortDesc?: boolean;
}): SQL => {
	const direction = sql.raw(sortDesc ? "DESC" : "ASC");
	const cursorPredicate = cursor
		? sortDesc
			? sql`AND (COALESCE(t.total, 0), c.internal_id) < (${cursor.total}, ${cursor.internalId})`
			: sql`AND (COALESCE(t.total, 0), c.internal_id) > (${cursor.total}, ${cursor.internalId})`
		: sql``;

	return sql`
		WITH totals AS (${balanceTotalsCte({ internalFeatureId })})
		SELECT c.internal_id AS internal_customer_id, COALESCE(t.total, 0) AS total
		FROM customers c
		LEFT JOIN totals t ON t.internal_customer_id = c.internal_id
		WHERE c.org_id = ${ORG_ID} AND c.env = ${ENV}
		${cursorPredicate}
		ORDER BY COALESCE(t.total, 0) ${direction}, c.internal_id ${direction}
		LIMIT ${PAGE_LIMIT + 1}
	`;
};

/** A2: MATERIALIZED totals — computed once instead of per parallel worker.
 * The inlined variant rebuilt the full hash in each of 5 workers. */
const buildMaterializedBalanceSortQuery = ({
	internalFeatureId,
	sortDesc = true,
}: {
	internalFeatureId: string;
	sortDesc?: boolean;
}): SQL => {
	const direction = sql.raw(sortDesc ? "DESC" : "ASC");
	return sql`
		WITH totals AS MATERIALIZED (${balanceTotalsCte({ internalFeatureId })})
		SELECT c.internal_id AS internal_customer_id, COALESCE(t.total, 0) AS total
		FROM customers c
		LEFT JOIN totals t ON t.internal_customer_id = c.internal_id
		WHERE c.org_id = ${ORG_ID} AND c.env = ${ENV}
		ORDER BY COALESCE(t.total, 0) ${direction}, c.internal_id ${direction}
		LIMIT ${PAGE_LIMIT + 1}
	`;
};

/** A3: totals-only — skips the customers join entirely, so zero-balance
 * customers are EXCLUDED. Different semantics; bounds the aggregate cost. */
const buildTotalsOnlyBalanceSortQuery = ({
	internalFeatureId,
	sortDesc = true,
}: {
	internalFeatureId: string;
	sortDesc?: boolean;
}): SQL => {
	const direction = sql.raw(sortDesc ? "DESC" : "ASC");
	return sql`
		WITH totals AS MATERIALIZED (${balanceTotalsCte({ internalFeatureId })})
		SELECT t.internal_customer_id, t.total
		FROM totals t
		ORDER BY t.total ${direction}, t.internal_customer_id ${direction}
		LIMIT ${PAGE_LIMIT + 1}
	`;
};

const resolveDeepCursor = async ({
	db,
	internalFeatureId,
	deepOffset,
}: {
	db: DB;
	internalFeatureId: string;
	deepOffset: number;
}): Promise<{ total: number; internalId: string } | null> => {
	const rows = await runReadOnly({
		db,
		query: sql`
			WITH totals AS (${balanceTotalsCte({ internalFeatureId })})
			SELECT c.internal_id AS internal_customer_id, COALESCE(t.total, 0) AS total
			FROM customers c
			LEFT JOIN totals t ON t.internal_customer_id = c.internal_id
			WHERE c.org_id = ${ORG_ID} AND c.env = ${ENV}
			ORDER BY COALESCE(t.total, 0) DESC, c.internal_id DESC
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
			`=== SORT BY FEATURE BALANCE (keyset resolver) EXPERIMENT (${usingReplica ? "REPLICA" : "PRIMARY"}) ===`,
		);
		console.log(
			JSON.stringify(
				{ ORG_ID, ENV, FEATURE_ID, PAGE_LIMIT, REPEATS, DEEP_OFFSET_PCT },
				null,
				2,
			),
		);

		const stats = await runReadOnly({
			db,
			query: sql`
				SELECT
					(SELECT COUNT(*)::int FROM customers c WHERE c.org_id = ${ORG_ID} AND c.env = ${ENV}) AS customers,
					(SELECT COUNT(*)::int FROM features f WHERE f.org_id = ${ORG_ID} AND f.env = ${ENV}) AS features
			`,
		});
		console.log(`\nOrg stats: ${JSON.stringify(stats[0])}`);

		const feature = await pickFeature({ db });
		console.log(
			`\nUsing feature: ${feature.id} (internal ${feature.internal_id}, ~${Number(feature.cus_ent_count).toLocaleString()} cusEnts)`,
		);

		// ── A2: MATERIALIZED totals (one aggregate pass, not per-worker) ──
		await measure({
			db,
			label: `A2: MATERIALIZED totals, first page (feature ${feature.id}, desc)`,
			query: buildMaterializedBalanceSortQuery({
				internalFeatureId: feature.internal_id,
			}),
			printSql: false,
		});

		// ── A3: totals-only, zero-balance customers excluded ──
		await measure({
			db,
			label: `A3: totals-only (no customers join, zero-balance excluded), desc`,
			query: buildTotalsOnlyBalanceSortQuery({
				internalFeatureId: feature.internal_id,
			}),
			printSql: false,
		});

		console.log("\n✅ Done");
	} finally {
		await client.end();
		process.exit(0);
	}
};

await main();
