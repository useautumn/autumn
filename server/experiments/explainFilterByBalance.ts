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
//   infisical run --env=prod --recursive -- bun run server/experiments/explainFilterByBalance.ts

// ─── Configuration ──────────────────────────────────────────────────
const ORG_ID = prodTestOrgId;
const ENV = AppEnv.Live;
const FEATURE_IDS = ["SEARCH_CREDITS", "CREDITS"];
const PREDICATES: { op: ">" | "<"; x: number }[] = [
	{ op: ">", x: 1_500_000 },
	{ op: "<", x: 200_000 },
];
const PAGE_LIMIT = 50;
const REPEATS = 5;
const STATEMENT_TIMEOUT_MS = 30_000;
const MATCH_COUNT_CAP = 100_000;
// Max live cusEnt rows per (customer, feature) assumed by prefilter-verify.
const ROW_BOUND = Number(process.env.PREFILTER_ROW_BOUND ?? 4);
const TRUNCATE_EXPLAIN = true;
const EXPLAIN_MAX_LINES = 30;
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
	const wallClock = () => new Date().toISOString().slice(11, 23);
	console.log(`\n=== ${label} ===`);
	console.log(`[start ${wallClock()}]`);
	if (printSql) printSqlQuery({ query, label });

	// A timed-out cell is a result, not a crash — report and move on.
	try {
		await runReadOnly({ db, query });
	} catch (err) {
		console.log(
			`⏱️  FAILED (likely statement_timeout ${STATEMENT_TIMEOUT_MS}ms) [end ${wallClock()}]: ${err instanceof Error ? err.message : err}`,
		);
		return [];
	}

	const samples: number[] = [];
	let rows: Record<string, unknown>[] = [];
	try {
		for (let i = 0; i < REPEATS; i++) {
			const startedAt = performance.now();
			rows = await runReadOnly({ db, query });
			samples.push(performance.now() - startedAt);
		}
	} catch (err) {
		console.log(
			`⏱️  FAILED after ${samples.length}/${REPEATS} repeats: ${err instanceof Error ? err.message : err}`,
		);
		if (samples.length === 0) return [];
	}
	samples.sort((a, b) => a - b);
	const p50 = samples[Math.floor(samples.length / 2)];
	console.log(
		`Rows: ${rows.length}  p50=${p50.toFixed(1)}ms  min=${samples[0].toFixed(1)}ms  max=${samples[samples.length - 1].toFixed(1)}ms  (${samples.length} repeats, warm)  [end ${wallClock()}]`,
	);

	if (explain) await printExplainPlan({ db, query, label });
	return rows;
};

// ─── Shared fragments ────────────────────────────────────────────────

// Same exclusions as the balance-sort experiment: expired cusEnts, lapsed
// loose entitlements, pooled contributions (their balance lives on the pool).
const liveCusEntPredicate = (): SQL => sql`
	ce.expired IS NOT TRUE
	AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
	AND ce.pooled_contribution_id IS NULL
`;

const opSql = (op: ">" | "<"): SQL => sql.raw(op);

/**
 * Shape 1: lazy keyset walk. Customers in cursor-index order, per-candidate
 * balance sum via LATERAL probe, filter, stop at page size. Customers with no
 * cusEnt for the feature count as total 0 (so "< x" includes them).
 */
const buildLazyWalkQuery = ({
	internalFeatureId,
	op,
	x,
}: {
	internalFeatureId: string;
	op: ">" | "<";
	x: number;
}): SQL => sql`
	SELECT c.internal_id AS internal_customer_id, c.created_at, c.id, bal.total
	FROM customers c
	JOIN LATERAL (
		SELECT COALESCE(SUM(ce.balance), 0) AS total
		FROM customer_entitlements ce
		WHERE ce.internal_customer_id = c.internal_id
			AND ce.internal_feature_id = ${internalFeatureId}
			AND ${liveCusEntPredicate()}
	) bal ON true
	WHERE c.org_id = ${ORG_ID}
		AND c.env = ${ENV}
		AND bal.total ${opSql(op)} ${x}
	ORDER BY c.created_at DESC, c.id DESC
	LIMIT ${PAGE_LIMIT + 1}
`;

/**
 * Shape 2: aggregate + HAVING. Full sum pass over the feature's cusEnts, keep
 * matching customers, then keyset-order via customers join. Flat cost
 * regardless of selectivity. NOTE: excludes customers with no cusEnt rows, so
 * "< x" results can differ from shape 1 (zero-balance customers missing).
 */
const buildAggregateHavingQuery = ({
	internalFeatureId,
	op,
	x,
}: {
	internalFeatureId: string;
	op: ">" | "<";
	x: number;
}): SQL => sql`
	WITH matched AS MATERIALIZED (
		SELECT ce.internal_customer_id, SUM(ce.balance) AS total
		FROM customer_entitlements ce
		WHERE ce.internal_feature_id = ${internalFeatureId}
			AND ${liveCusEntPredicate()}
		GROUP BY ce.internal_customer_id
		HAVING SUM(ce.balance) ${opSql(op)} ${x}
	)
	SELECT c.internal_id AS internal_customer_id, c.created_at, c.id, m.total
	FROM matched m
	JOIN customers c ON c.internal_id = m.internal_customer_id
	WHERE c.org_id = ${ORG_ID}
		AND c.env = ${ENV}
	ORDER BY c.created_at DESC, c.id DESC
	LIMIT ${PAGE_LIMIT + 1}
`;

/**
 * Shape 3 (`>` only): prefilter-and-verify. Any customer with SUM > x and at
 * most K live rows must own a row with balance > x/K — range-filter rows,
 * dedupe customers, verify exact sums. False positives verify away; false
 * negatives only if a customer exceeds K rows for the feature (checked by
 * comparing the verified count against the aggregate's).
 * Today balance is a heap filter over the feature index; with
 *   CREATE INDEX ... ON customer_entitlements (internal_feature_id, balance)
 *     WHERE expired IS NOT TRUE AND pooled_contribution_id IS NULL
 * the prefilter becomes a small range scan. NOTE: indexing balance disables
 * HOT updates for the hottest write path — needs a write bench before DDL.
 */
const buildPrefilterVerifyQuery = ({
	internalFeatureId,
	x,
	rowBound,
}: {
	internalFeatureId: string;
	x: number;
	rowBound: number;
}): SQL => sql`
	WITH candidates AS (
		SELECT DISTINCT ce.internal_customer_id
		FROM customer_entitlements ce
		WHERE ce.internal_feature_id = ${internalFeatureId}
			AND ce.balance > ${x}::numeric / ${rowBound}
			AND ${liveCusEntPredicate()}
	),
	verified AS (
		SELECT cand.internal_customer_id, v.total
		FROM candidates cand
		JOIN LATERAL (
			SELECT SUM(ce.balance) AS total
			FROM customer_entitlements ce
			WHERE ce.internal_customer_id = cand.internal_customer_id
				AND ce.internal_feature_id = ${internalFeatureId}
				AND ${liveCusEntPredicate()}
		) v ON true
		WHERE v.total > ${x}
	)
	SELECT c.internal_id AS internal_customer_id, c.created_at, c.id, v.total
	FROM verified v
	JOIN customers c ON c.internal_id = v.internal_customer_id
	WHERE c.org_id = ${ORG_ID}
		AND c.env = ${ENV}
	ORDER BY c.created_at DESC, c.id DESC
	LIMIT ${PAGE_LIMIT + 1}
`;

const prefilterVerifiedCount = async ({
	db,
	internalFeatureId,
	x,
	rowBound,
}: {
	db: DB;
	internalFeatureId: string;
	x: number;
	rowBound: number;
}): Promise<number> => {
	const rows = await runReadOnly({
		db,
		query: sql`
			SELECT COUNT(*) AS n FROM (
				SELECT cand.internal_customer_id
				FROM (
					SELECT DISTINCT ce.internal_customer_id
					FROM customer_entitlements ce
					WHERE ce.internal_feature_id = ${internalFeatureId}
						AND ce.balance > ${x}::numeric / ${rowBound}
						AND ${liveCusEntPredicate()}
				) cand
				JOIN LATERAL (
					SELECT SUM(ce.balance) AS total
					FROM customer_entitlements ce
					WHERE ce.internal_customer_id = cand.internal_customer_id
						AND ce.internal_feature_id = ${internalFeatureId}
						AND ${liveCusEntPredicate()}
				) v ON true
				WHERE v.total > ${x}
			) verified
		`,
	});
	return Number((rows[0] as { n: number | string }).n);
};

const cappedMatchCount = async ({
	db,
	internalFeatureId,
	op,
	x,
}: {
	db: DB;
	internalFeatureId: string;
	op: ">" | "<";
	x: number;
}): Promise<number> => {
	const rows = await runReadOnly({
		db,
		query: sql`
			SELECT COUNT(*) AS n FROM (
				SELECT 1
				FROM customer_entitlements ce
				WHERE ce.internal_feature_id = ${internalFeatureId}
					AND ${liveCusEntPredicate()}
				GROUP BY ce.internal_customer_id
				HAVING SUM(ce.balance) ${opSql(op)} ${x}
				LIMIT ${MATCH_COUNT_CAP}
			) capped
		`,
	});
	return Number((rows[0] as { n: number | string }).n);
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
			`=== FILTER BY BALANCE EXPERIMENT (${usingReplica ? "REPLICA" : "PRIMARY"}) ===`,
		);
		console.log(
			JSON.stringify(
				{ ORG_ID, ENV, FEATURE_IDS, PREDICATES, PAGE_LIMIT, REPEATS },
				null,
				2,
			),
		);

		const stats = await runReadOnly({
			db,
			query: sql`
				SELECT COUNT(*)::int AS customers
				FROM customers c
				WHERE c.org_id = ${ORG_ID} AND c.env = ${ENV}
			`,
		});
		console.log(`\nOrg stats: ${JSON.stringify(stats[0])}`);

		for (const featureId of FEATURE_IDS) {
			const featureRows = await runReadOnly({
				db,
				query: sql`
					SELECT f.internal_id FROM features f
					WHERE f.org_id = ${ORG_ID} AND f.env = ${ENV} AND f.id = ${featureId}
				`,
			});
			const internalFeatureId = (
				featureRows[0] as { internal_id: string } | undefined
			)?.internal_id;
			if (!internalFeatureId) {
				console.log(`\n⚠️  Feature ${featureId} not found for org — skipping.`);
				continue;
			}
			console.log(`\n\n───── Feature ${featureId} (${internalFeatureId}) ─────`);

			for (const { op, x } of PREDICATES) {
				const matchCount = await cappedMatchCount({
					db,
					internalFeatureId,
					op,
					x,
				});
				console.log(
					`\nMatches for balance ${op} ${x.toLocaleString()}: ${matchCount.toLocaleString()}${matchCount >= MATCH_COUNT_CAP ? "+ (capped)" : ""} (cusEnt holders only)`,
				);

				await measure({
					db,
					label: `${featureId} balance ${op} ${x.toLocaleString()} — LAZY WALK`,
					query: buildLazyWalkQuery({ internalFeatureId, op, x }),
					printSql: op === ">" && featureId === FEATURE_IDS[0],
				});

				await measure({
					db,
					label: `${featureId} balance ${op} ${x.toLocaleString()} — AGGREGATE+HAVING`,
					query: buildAggregateHavingQuery({ internalFeatureId, op, x }),
					printSql: op === ">" && featureId === FEATURE_IDS[0],
				});

				if (op === ">") {
					const verifiedCount = await prefilterVerifiedCount({
						db,
						internalFeatureId,
						x,
						rowBound: ROW_BOUND,
					});
					const agrees = verifiedCount === matchCount;
					console.log(
						`Prefilter-verify count (K=${ROW_BOUND}): ${verifiedCount.toLocaleString()} vs aggregate ${matchCount.toLocaleString()} — ${agrees ? "MATCH ✅" : "MISMATCH ❌ (a customer exceeds K live rows; raise ROW_BOUND)"}`,
					);

					await measure({
						db,
						label: `${featureId} balance ${op} ${x.toLocaleString()} — PREFILTER+VERIFY (K=${ROW_BOUND})`,
						query: buildPrefilterVerifyQuery({
							internalFeatureId,
							x,
							rowBound: ROW_BOUND,
						}),
						printSql: featureId === FEATURE_IDS[0],
					});
				}
			}
		}

		console.log("\n✅ Done");
	} catch (error) {
		console.error("\n❌ Experiment failed:");
		console.error(error instanceof Error ? error.stack : String(error));
		process.exitCode = 1;
	} finally {
		await client.end();
		process.exit();
	}
};

await main();
