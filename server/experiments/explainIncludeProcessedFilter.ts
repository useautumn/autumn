import { AppEnv } from "@autumn/shared";
import { compileFilter } from "@autumn/shared/api/migrations/compiler/compileFilter.js";
import type { CustomerFilter } from "@autumn/shared/api/migrations/filters/customerFilter.js";
import { type SQL, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	buildCustomerCount,
	buildCustomerSelect,
	buildProcessedPreviewCount,
	buildProcessedPreviewSelect,
} from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import { rawWithParamsToDrizzle } from "@/internal/migrations/v2/filters/rawWithParamsToDrizzle.js";
// Import initDrizzle directly — avoid `experimentEnv` because its
// `loadLocalEnv()` reads `server/.env` and clobbers env vars injected by
// `infisical run --env=staging` (e.g. DATABASE_URL).
import { initDrizzle } from "../src/db/initDrizzle";
import { FeatureService } from "../src/internal/features/FeatureService.js";

// Why this experiment exists: the "include processed customers" preview
// (handlePreviewMigrationFilter + buildCustomerSelect) ORs the org/env-scoped
// compiled filter with `c.internal_id IN (<processed subquery>)`. The OR strips
// org/env scoping from the second branch, so the planner can't use
// idx_customers_org_env_internal_id and may seq-scan ALL customers. This script
// EXPLAINs the current OR query against an equivalent UNION rewrite to confirm
// the bottleneck and decide whether a new index is needed.
//
// Run against a remote env (e.g. staging) via infisical:
//   infisical run --env=staging --recursive -- \
//     bun run server/experiments/explainIncludeProcessedFilter.ts

const prodTestOrgId = (() => {
	const v = process.env.PROD_TEST_ORG_ID;
	if (!v) throw new Error("PROD_TEST_ORG_ID env var is required");
	return v;
})();

const dbUrl = process.env.DATABASE_URL ?? "";
console.log(
	"DATABASE URL host:",
	dbUrl.replace(/:\/\/[^@]+@/, "://***:***@") || "(empty)",
);

// ─── Configuration ──────────────────────────────────────────────────
const ORG_ID = prodTestOrgId;
const ENV = AppEnv.Live;
const SAMPLE_LIMIT = 10; // matches the default preview page size
const TRUNCATE_EXPLAIN = true;
const EXPLAIN_MAX_LINES = 40;

// Optional override. When unset, the script auto-discovers the migration in
// this org/env with the most live (dry_run = false) customer item runs.
const MIGRATION_INTERNAL_ID = process.env.MIGRATION_INTERNAL_ID || undefined;

// User-facing migration id (the `id` column, resolved to internal_id like the
// production handler does). Takes precedence over auto-discovery.
const MIGRATION_ID = process.env.MIGRATION_ID || "plan_pro-update";

// Filter the live preview applies. Keep it representative of a real migration
// selection. An empty `{}` matches all customers in the org/env.
const FILTER: CustomerFilter = {
	plan: { plan_id: "free" },
};

// ═════════════════════════════════════════════════════════════════════

const truncateExplainText = (text: string, maxLines: number): string => {
	const lines = text.split("\n");
	if (lines.length <= maxLines) return text;
	const omitted = lines.length - maxLines;
	return [...lines.slice(0, maxLines), `... (${omitted} more lines truncated)`].join(
		"\n",
	);
};

const printExplainPlan = async ({
	db,
	query,
	label,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	query: SQL;
	label: string;
}) => {
	console.log(`\n--- EXPLAIN ANALYZE: ${label} ---`);
	const explainResult = await db.execute(
		sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}`,
	);
	const lines: string[] = [];
	for (const row of explainResult)
		lines.push(String((row as Record<string, unknown>)["QUERY PLAN"]));
	const joined = lines.join("\n");
	console.log(
		TRUNCATE_EXPLAIN ? truncateExplainText(joined, EXPLAIN_MAX_LINES) : joined,
	);
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

const runMeasured = async ({
	db,
	query,
	label,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	query: SQL;
	label: string;
}) => {
	console.log(`\n=== ${label} ===`);
	printSqlQuery({ query, label });
	const startedAt = performance.now();
	const result = await db.execute(query);
	const elapsedMs = performance.now() - startedAt;
	console.log(`Rows returned: ${result.length}`);
	console.log(`Wall-clock: ${elapsedMs.toFixed(2)}ms`);
	if (label.startsWith("COUNT") && result.length > 0)
		console.log(`Count: ${(result[0] as Record<string, unknown>).count}`);
	await printExplainPlan({ db, query, label });
};

const compiledWhere = ({
	filter,
	features,
}: {
	filter: CustomerFilter;
	features: Awaited<ReturnType<typeof FeatureService.list>>;
}): SQL =>
	rawWithParamsToDrizzle(
		compileFilter({
			filter,
			ctx: { features },
			ambient: { orgId: ORG_ID, env: ENV },
		}),
	);

// The processed-customers subquery, identical to buildIncludeProcessedOr.
const processedSubquery = (migrationInternalId: string): SQL => sql`
	SELECT mir.item_id FROM migration_item_runs mir
	WHERE mir.migration_internal_id = ${migrationInternalId}
		AND mir.item_kind = 'customer'
		AND mir.dry_run = false
`;

// Proposed UNION rewrite: each branch keeps its own scoping so the planner can
// use an index per branch instead of seq-scanning all customers.
const buildUnionSelect = ({
	where,
	migrationInternalId,
	limit,
}: {
	where: SQL;
	migrationInternalId: string;
	limit: number;
}): SQL => sql`
	SELECT u.internal_id, u.id, u.name, u.email
	FROM (
		SELECT c.internal_id, c.id, c.name, c.email
		FROM customers c
		WHERE (${where})
		UNION
		SELECT c.internal_id, c.id, c.name, c.email
		FROM customers c
		WHERE c.internal_id IN (${processedSubquery(migrationInternalId)})
	) u
	ORDER BY u.internal_id DESC
	LIMIT ${limit}
`;

const buildUnionCount = ({
	where,
	migrationInternalId,
}: {
	where: SQL;
	migrationInternalId: string;
}): SQL => sql`
	SELECT COUNT(*)::bigint AS count
	FROM (
		SELECT c.internal_id
		FROM customers c
		WHERE (${where})
		UNION
		SELECT c.internal_id
		FROM customers c
		WHERE c.internal_id IN (${processedSubquery(migrationInternalId)})
	) u
`;

// Resolve a user-facing migration `id` to its `internal_id`, scoped to org/env
// — mirrors migrationRepo.find used by handlePreviewMigrationFilter.
const resolveMigrationInternalId = async (
	db: ReturnType<typeof initDrizzle>["db"],
	id: string,
): Promise<string | undefined> => {
	const rows = (await db.execute(sql`
		SELECT internal_id FROM migrations
		WHERE org_id = ${ORG_ID} AND env = ${ENV} AND id = ${id}
		LIMIT 1
	`)) as Array<{ internal_id: string }>;
	return rows[0]?.internal_id;
};

const discoverMigrationInternalId = async (
	db: ReturnType<typeof initDrizzle>["db"],
): Promise<string | undefined> => {
	const rows = (await db.execute(sql`
		SELECT mir.migration_internal_id AS migration_internal_id, COUNT(*) AS n
		FROM migration_item_runs mir
		JOIN migration_runs mr ON mr.migration_internal_id = mir.migration_internal_id
		WHERE mr.org_id = ${ORG_ID}
			AND mr.env = ${ENV}
			AND mir.item_kind = 'customer'
			AND mir.dry_run = false
		GROUP BY mir.migration_internal_id
		ORDER BY n DESC
		LIMIT 5
	`)) as Array<{ migration_internal_id: string; n: bigint | number }>;

	if (rows.length === 0) return undefined;
	console.log("\nMigrations with live customer item runs (top 5):");
	for (const r of rows)
		console.log(`  ${r.migration_internal_id} → ${Number(r.n)} processed`);
	return rows[0].migration_internal_id;
};

const main = async () => {
	const replicaUrl = process.env.DATABASE_REPLICA_URL;
	const usingReplica = Boolean(replicaUrl);
	if (!usingReplica)
		console.warn(
			"DATABASE_REPLICA_URL not set — falling back to DATABASE_URL (primary). Set the replica URL to test against the read replica.",
		);
	const { db } = initDrizzle({ replica: usingReplica });

	console.log(
		`=== INCLUDE-PROCESSED FILTER EXPERIMENT (${usingReplica ? "REPLICA" : "PRIMARY"}) ===`,
	);
	console.log(JSON.stringify({ ORG_ID, ENV, FILTER }, null, 2));

	let migrationInternalId = MIGRATION_INTERNAL_ID;
	if (!migrationInternalId && MIGRATION_ID) {
		migrationInternalId = await resolveMigrationInternalId(db, MIGRATION_ID);
		if (migrationInternalId)
			console.log(`\nResolved MIGRATION_ID '${MIGRATION_ID}' → ${migrationInternalId}`);
		else
			console.warn(
				`\nMIGRATION_ID '${MIGRATION_ID}' not found for this org/env — falling back to auto-discovery.`,
			);
	}
	migrationInternalId ??= await discoverMigrationInternalId(db);
	if (!migrationInternalId) {
		console.error(
			"\nNo migration with live customer item runs found for this org/env. " +
				"Set MIGRATION_INTERNAL_ID or MIGRATION_ID explicitly to test a specific migration.",
		);
		process.exit(1);
	}
	console.log(`\nUsing migration_internal_id: ${migrationInternalId}`);

	const orgFeatures = await FeatureService.list({ db, orgId: ORG_ID, env: ENV });
	console.log(`\nLoaded ${orgFeatures.length} features for resolution context.`);
	const ctx = { features: orgFeatures };
	const where = compiledWhere({ filter: FILTER, features: orgFeatures });

	const includeProcessed = { migrationInternalId };

	// 1. Isolated processed subquery — confirms migration_item_runs index coverage.
	await runMeasured({
		db,
		query: sql`SELECT mir.item_id FROM migration_item_runs mir
			WHERE mir.migration_internal_id = ${migrationInternalId}
				AND mir.item_kind = 'customer'
				AND mir.dry_run = false`,
		label: "SUBQUERY (processed item_ids only)",
	});

	// 2. Pure filter — exactly what the FILTER STEP (no migrationId) runs.
	//    Baseline to prove the customer filter alone is fast; only the live
	//    view's includeProcessed OR is slow.
	await runMeasured({
		db,
		query: buildCustomerCount({ orgId: ORG_ID, env: ENV, filter: FILTER, ctx }),
		label: "COUNT [filter only — filter step]",
	});
	await runMeasured({
		db,
		query: buildCustomerSelect({
			orgId: ORG_ID,
			env: ENV,
			filter: FILTER,
			ctx,
			limit: SAMPLE_LIMIT,
		}),
		label: `SELECT [filter only — filter step] (limit ${SAMPLE_LIMIT})`,
	});

	// 3. Live-view path: the dedicated preview builders (filter ∪ processed).
	await runMeasured({
		db,
		query: buildProcessedPreviewCount({
			orgId: ORG_ID,
			env: ENV,
			filter: FILTER,
			ctx,
			includeProcessed,
		}),
		label: "COUNT [preview builder]",
	});
	await runMeasured({
		db,
		query: buildProcessedPreviewSelect({
			orgId: ORG_ID,
			env: ENV,
			filter: FILTER,
			ctx,
			includeProcessed,
			limit: SAMPLE_LIMIT,
		}),
		label: `SELECT [preview builder] (limit ${SAMPLE_LIMIT})`,
	});

	// 4. Hand-written UNION reference (sanity check the builder matches this).
	await runMeasured({
		db,
		query: buildUnionCount({ where, migrationInternalId }),
		label: "COUNT [UNION — proposed]",
	});
	await runMeasured({
		db,
		query: buildUnionSelect({ where, migrationInternalId, limit: SAMPLE_LIMIT }),
		label: `SELECT [UNION — proposed] (limit ${SAMPLE_LIMIT})`,
	});

	process.exit(0);
};

await main();
