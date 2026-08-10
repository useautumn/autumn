import { AppEnv } from "@autumn/shared";
import { sql } from "drizzle-orm";
// Import initDrizzle directly — experimentEnv's loadLocalEnv() clobbers vars
// injected by `infisical run --env=staging`.
import { initDrizzle } from "../src/db/initDrizzle";
import { buildFeatureStatesQuery } from "../src/internal/features/repos/listFeatureStates";

// Single feature-state probe for catalogV2 setupFeatureStatesContext.
// bun auto-loads server/.env.local over the inherited env, so the target DB
// comes in via EXPLAIN_DATABASE_URL (no .env file defines it). Run from server:
//   EXPLAIN_ORG_ID=... infisical run --env=staging --recursive -- sh -c \
//     'EXPLAIN_DATABASE_URL="$DATABASE_V2_URL" bun run experiments/explainFeatureUsage.ts [--analyze]'

const STATEMENT_TIMEOUT_MS = 30_000;

const dbUrl = process.env.EXPLAIN_DATABASE_URL ?? "";
const maskedUrl = dbUrl.replace(/:\/\/[^@]+@/, "://***:***@") || "(empty)";
if (!dbUrl) throw new Error("EXPLAIN_DATABASE_URL env var is required");
if (/autumn-prod|-prod-/i.test(dbUrl) && process.env.ALLOW_NON_STAGING !== "1") {
	throw new Error(`EXPLAIN_DATABASE_URL looks like prod (${maskedUrl}). Use staging.`);
}
if (
	dbUrl.includes("pg.psdb.cloud") &&
	!dbUrl.includes("zg829hpzvvkc") &&
	process.env.ALLOW_NON_STAGING !== "1"
) {
	throw new Error(
		`psdb URL is not the staging branch (zg829hpzvvkc): ${maskedUrl}`,
	);
}
console.log("target:", maskedUrl.slice(0, 90));

const requireEnv = ({ key }: { key: string }) => {
	const value = process.env[key];
	if (!value) throw new Error(`${key} env var is required`);
	return value;
};

const orgId = requireEnv({ key: "EXPLAIN_ORG_ID" });
const env =
	process.env.EXPLAIN_APP_ENV === AppEnv.Sandbox ? AppEnv.Sandbox : AppEnv.Live;
const analyze = process.argv.includes("--analyze");

const { db, client } = initDrizzle({ maxConnections: 2, databaseUrl: dbUrl });

const runPlan = async ({
	query,
}: {
	query: ReturnType<typeof sql>;
}): Promise<{ "QUERY PLAN": string }[]> =>
	db.transaction(async (tx) => {
		await tx.execute(
			sql.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`),
		);
		const result = await tx.execute<{ "QUERY PLAN": string }>(
			analyze
				? sql`EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT) ${query}`
				: sql`EXPLAIN (VERBOSE, FORMAT TEXT) ${query}`,
		);
		const rows = (result as { rows?: { "QUERY PLAN": string }[] }).rows;
		return rows ?? (result as unknown as { "QUERY PLAN": string }[]);
	});

const section = (title: string) => console.log(`\n=== ${title} ===`);

const main = async () => {
	section(`org shape (org ${orgId.slice(0, 8)}…, env ${env})`);
	const shape = await db.execute<Record<string, number>>(sql`
		SELECT
			(SELECT count(*)::int FROM features f
				WHERE f.org_id = ${orgId} AND f.env = ${env}) AS features,
			(SELECT count(*)::int FROM products p
				WHERE p.org_id = ${orgId} AND p.env = ${env}) AS product_versions,
			(SELECT count(*)::int FROM entitlements e
				JOIN features f ON f.internal_id = e.internal_feature_id
				WHERE f.org_id = ${orgId} AND f.env = ${env}) AS entitlements,
			(SELECT count(*)::int FROM prices pr
				WHERE pr.org_id = ${orgId}) AS prices_all_envs
	`);
	console.table(shape);

	const features = await db.execute<{ internal_id: string; id: string }>(sql`
		SELECT internal_id, id FROM features
		WHERE org_id = ${orgId} AND env = ${env}
		ORDER BY created_at
	`);
	if (features.length === 0) throw new Error("org has no features in this env");

	// EXPLAIN_COUNT_ALL_ROWS=1 → every feature runs rewrite COUNTs (worst case).
	// Default: half/half — mirrors a typical mixed catalog batch.
	const countAllRows = process.env.EXPLAIN_COUNT_ALL_ROWS === "1";
	const featureRefs = features.map((feature, index) => ({
		internalId: feature.internal_id,
		id: feature.id,
		countRows: countAllRows || index % 2 === 0,
	}));

	const query = buildFeatureStatesQuery({
		features: featureRefs,
		orgId,
		env,
	});

	section(`feature states (${features.length} features, analyze=${analyze})`);
	const plan = await runPlan({ query });
	for (const row of plan) console.log(row["QUERY PLAN"]);

	const start = performance.now();
	const rows = await db.execute(query);
	const wallMs = performance.now() - start;
	const payload = await db.execute<{ total_bytes: number }>(sql`
		SELECT coalesce(sum(octet_length(t::text)), 0)::bigint AS total_bytes
		FROM (${query}) t
	`);
	console.log(
		`rows=${rows.length} wall=${wallMs.toFixed(1)}ms payload=${payload[0]?.total_bytes}B`,
	);
	console.log("sample row keys:", Object.keys(rows[0] ?? {}));
};

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => client.end());
