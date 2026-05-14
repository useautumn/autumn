import { AppEnv } from "@autumn/shared";
import {
    buildCustomerCount,
    buildCustomerSelect,
} from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import type { CustomerFilter } from "@autumn/shared/api/migrations/filters/customerFilter.js";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
// Import initDrizzle directly — avoid `experimentEnv` because its
// `loadLocalEnv()` reads `server/.env` and clobbers env vars injected by
// `infisical run --env=staging` (e.g. DATABASE_URL).
import { initDrizzle } from "../src/db/initDrizzle";
import { FeatureService } from "../src/internal/features/FeatureService.js";

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
//   infisical run --env=staging --recursive -- bun run server/experiments/explainCustomerFilter.ts

// ─── Configuration ──────────────────────────────────────────────────
const ORG_ID = prodTestOrgId;
const ENV = AppEnv.Live;
const SAMPLE_LIMIT = 1_000;
const TRUNCATE_EXPLAIN = true;
const EXPLAIN_MAX_LINES = 20;


const FILTER: CustomerFilter = {
	// plan: { plan_id: "free" },
	// plan: { item: { feature_id: "CREDITS", price: { $ne: null } } }
	plan: { plan_id: "free", recurring: true }
};

const MIGRATION_PLAN = {
	filter: {
		customers: {
			
		}
	}
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
	if (label === "COUNT" && result.length > 0)
		console.log(`Count: ${(result[0] as Record<string, unknown>).count}`);
	await printExplainPlan({ db, query, label });
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
		`=== CUSTOMER FILTER EXPERIMENT (${usingReplica ? "REPLICA" : "PRIMARY"}) ===`,
	);
	console.log(JSON.stringify({ ORG_ID, ENV, FILTER }, null, 2));

	const orgFeatures = await FeatureService.list({
		db,
		orgId: ORG_ID,
		env: ENV,
	});
	console.log(`\nLoaded ${orgFeatures.length} features for resolution context.`);

	const ctx = { features: orgFeatures };

	const countQuery = buildCustomerCount({
		orgId: ORG_ID,
		env: ENV,
		filter: FILTER,
		ctx,
	});
	const selectQuery = buildCustomerSelect({
		orgId: ORG_ID,
		env: ENV,
		filter: FILTER,
		ctx,
		limit: SAMPLE_LIMIT,
	});

	await runMeasured({ db, query: countQuery, label: "COUNT" });
	await runMeasured({
		db,
		query: selectQuery,
		label: `SELECT (limit ${SAMPLE_LIMIT})`,
	});

	process.exit(0);
};

await main();
