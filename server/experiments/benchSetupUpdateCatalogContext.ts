import { AppEnv } from "@autumn/shared";
import { sql } from "drizzle-orm";
// Import initDrizzle directly — experimentEnv's loadLocalEnv() clobbers vars
// injected by `infisical run --env=staging`.
import { initDrizzle } from "../src/db/initDrizzle";
import { buildFeatureStatesQuery } from "../src/internal/features/repos/listFeatureStates";
import { buildFeatureUsageSummariesQuery } from "../src/internal/features/repos/listFeatureUsageSummaries";

// Worst-case wall-time bench for catalogV2 setupUpdateCatalogContext with
// preview: true — every org feature touched, all with rewrite COUNTs, both
// setup queries raced in Promise.all exactly as the action does. Run from server:
//   EXPLAIN_ORG_ID=... infisical run --env=staging --recursive -- sh -c \
//     'EXPLAIN_DATABASE_URL="$DATABASE_V2_URL" bun run experiments/benchSetupUpdateCatalogContext.ts'

const STATEMENT_TIMEOUT_MS = 30_000;
const BENCH_RUNS = 5;

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

const { db, client } = initDrizzle({ maxConnections: 4, databaseUrl: dbUrl });

const section = (title: string) => console.log(`\n=== ${title} ===`);

const timed = async <T>(run: () => Promise<T>): Promise<number> => {
	const start = performance.now();
	await run();
	return performance.now() - start;
};

const stats = (samples: number[]) => {
	const sorted = [...samples].sort((a, b) => a - b);
	return {
		min: sorted[0].toFixed(1),
		median: sorted[Math.floor(sorted.length / 2)].toFixed(1),
		max: sorted[sorted.length - 1].toFixed(1),
	};
};

const main = async () => {
	await db.execute(
		sql.raw(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`),
	);

	section(`org shape (org ${orgId.slice(0, 8)}…)`);
	const shape = await db.execute<Record<string, number>>(sql`
		SELECT
			f.env,
			count(*)::int AS features,
			(SELECT count(*)::int FROM products p
				WHERE p.org_id = ${orgId} AND p.env = f.env) AS product_versions,
			(SELECT count(*)::int FROM entitlements e
				JOIN features f2 ON f2.internal_id = e.internal_feature_id
				WHERE f2.org_id = ${orgId} AND f2.env = f.env) AS entitlements,
			(SELECT count(*)::int FROM customer_entitlements ce
				JOIN features f3 ON f3.internal_id = ce.internal_feature_id
				WHERE f3.org_id = ${orgId} AND f3.env = f.env) AS customer_entitlements
		FROM features f
		WHERE f.org_id = ${orgId}
		GROUP BY f.env
	`);
	console.table([...shape]);

	const features = await db.execute<{ internal_id: string; id: string }>(sql`
		SELECT internal_id, id FROM features
		WHERE org_id = ${orgId} AND env = ${env}
		ORDER BY created_at
	`);
	if (features.length === 0)
		throw new Error(`org has no features in env ${env}`);

	const stateRefs = [...features].map((feature) => ({
		internalId: feature.internal_id,
		id: feature.id,
		countRows: true, // worst case: every entry may rewrite references
	}));
	const usageRefs = [...features].map((feature) => ({
		internalId: feature.internal_id,
		id: feature.id,
	}));

	const statesQuery = () =>
		db.execute(buildFeatureStatesQuery({ features: stateRefs, orgId, env }));
	const usageQuery = () =>
		db.execute(buildFeatureUsageSummariesQuery({ features: usageRefs, orgId, env }));

	if (process.argv.includes("--analyze")) {
		section("EXPLAIN ANALYZE featureUsageSummaries");
		const plan = await db.execute<{ "QUERY PLAN": string }>(
			sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${buildFeatureUsageSummariesQuery(
				{ features: usageRefs, orgId, env },
			)}`,
		);
		for (const row of plan) console.log(row["QUERY PLAN"]);
		return;
	}

	section(
		`bench (${features.length} features touched, env ${env}, ${BENCH_RUNS} runs each)`,
	);

	const statesSamples: number[] = [];
	const usageSamples: number[] = [];
	const combinedSamples: number[] = [];

	// Warm the caches once so runs measure steady state, not cold buffers.
	await Promise.all([statesQuery(), usageQuery()]);

	for (let run = 0; run < BENCH_RUNS; run++) {
		statesSamples.push(await timed(statesQuery));
		usageSamples.push(await timed(usageQuery));
		// As the action runs it: both queries raced in Promise.all.
		combinedSamples.push(
			await timed(() => Promise.all([statesQuery(), usageQuery()])),
		);
	}

	console.log("featureStates (ms):        ", stats(statesSamples));
	console.log("featureUsageSummaries (ms):", stats(usageSamples));
	console.log("setup Promise.all (ms):    ", stats(combinedSamples));
};

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => client.end());
