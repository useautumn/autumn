import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppEnv, schemas } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { initDrizzle, prodTestOrgId } from "./experimentEnv";

const { rewardRepo, rewardProgramRepo } = await import(
	"../src/internal/rewards/repos/index"
);

// Run with:
//   REWARDS_ORG_ID=org_2x3YWDWucn3OSul12pIV6XrcXyo bun run experiments/explainGetRewards.ts

const main = async () => {
	const orgId = process.env.REWARDS_ORG_ID || prodTestOrgId;
	const env = AppEnv.Live;

	const { db } = initDrizzle();

	console.log(`--- Running GET /products/rewards for org=${orgId} env=${env} ---\n`);

	const startBoth = performance.now();
	const [rewards, rewardPrograms] = await Promise.all([
		rewardRepo.list({ db, orgId, env }),
		rewardProgramRepo.list({ db, orgId, env }),
	]);
	const elapsedBoth = performance.now() - startBoth;

	console.log(`Both queries (Promise.all): ${elapsedBoth.toFixed(2)}ms`);
	console.log(`  rewards: ${rewards.length} rows`);
	console.log(`  rewardPrograms: ${rewardPrograms.length} rows\n`);

	const startRewards = performance.now();
	const rewardsAlone = await rewardRepo.list({ db, orgId, env });
	const elapsedRewards = performance.now() - startRewards;
	console.log(`rewardRepo.list alone: ${elapsedRewards.toFixed(2)}ms (${rewardsAlone.length} rows)`);

	const startPrograms = performance.now();
	const programsAlone = await rewardProgramRepo.list({ db, orgId, env });
	const elapsedPrograms = performance.now() - startPrograms;
	console.log(`rewardProgramRepo.list alone: ${elapsedPrograms.toFixed(2)}ms (${programsAlone.length} rows)\n`);

	// Capture the actual SQL Drizzle generates for rewardRepo.list by wiring up
	// a separate drizzle client with a logger. This lets us EXPLAIN ANALYZE the
	// real query — not a hand-rolled approximation.
	const capturedQueries: { query: string; params: unknown[] }[] = [];
	const pool = new pg.Pool({
		connectionString: process.env.DATABASE_URL,
		max: 2,
	});
	const loggedDb = drizzle(pool, {
		schema: schemas,
		logger: {
			logQuery: (query, params) => capturedQueries.push({ query, params }),
		},
	});
	await rewardRepo.list({ db: loggedDb as never, orgId, env });
	const rewardSql = capturedQueries.find((q) => q.query.includes("rewards"));
	if (!rewardSql) {
		console.log("Could not capture Drizzle SQL — bailing on EXPLAIN.\n");
	} else {
		console.log("--- Drizzle-generated SQL for rewardRepo.list ---\n");
		console.log(rewardSql.query);
		console.log("\nParams:", rewardSql.params, "\n");

		console.log("--- EXPLAIN (ANALYZE, BUFFERS) on the actual Drizzle query ---\n");
		const explainQuery = sql.raw(
			`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${rewardSql.query}`,
		);
		// Bind the same params Drizzle bound.
		const plan = await pool.query(
			`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${rewardSql.query}`,
			rewardSql.params as unknown[],
		);
		const planLines: string[] = [];
		for (const row of plan.rows) {
			const line = (row as Record<string, unknown>)["QUERY PLAN"];
			if (typeof line === "string") planLines.push(line);
		}
		console.log(planLines.join("\n"));

		const outDir = resolve(import.meta.dir, "out");
		try {
			const { mkdirSync } = await import("node:fs");
			mkdirSync(outDir, { recursive: true });
		} catch {
			// ignore
		}
		const planPath = resolve(outDir, "rewards-explain.txt");
		writeFileSync(planPath, planLines.join("\n"));
		console.log(`\nWritten to: ${planPath}\n`);

		const usedIndex = planLines.find((l) => /Index Scan|Index Only Scan/.test(l));
		const seqScan = planLines.find((l) => /Seq Scan on entitlements/.test(l));
		console.log("--- Verdict ---");
		if (seqScan) {
			console.log("❌ Still seq-scanning entitlements. Index not picked up.");
			console.log(`   ${seqScan.trim()}`);
		} else if (usedIndex) {
			console.log("✅ Index scan in plan:");
			for (const l of planLines.filter((l) => /Index/.test(l))) {
				console.log(`   ${l.trim()}`);
			}
		}
		console.log();

		await pool.end();
	}

	console.log("--- Table sizes ---\n");
	const sizes = await db.execute(sql`
		SELECT
			'rewards' AS table_name,
			(SELECT count(*) FROM rewards) AS total_rows,
			(SELECT count(*) FROM rewards WHERE org_id = ${orgId} AND env = ${env}) AS org_rows,
			pg_size_pretty(pg_relation_size('rewards')) AS table_size
		UNION ALL
		SELECT
			'reward_programs',
			(SELECT count(*) FROM reward_programs),
			(SELECT count(*) FROM reward_programs WHERE org_id = ${orgId} AND env = ${env}),
			pg_size_pretty(pg_relation_size('reward_programs'))
		UNION ALL
		SELECT
			'entitlements',
			(SELECT count(*) FROM entitlements),
			(SELECT count(*) FROM entitlements WHERE internal_reward_id IS NOT NULL),
			pg_size_pretty(pg_relation_size('entitlements'))
	`);
	for (const row of sizes) {
		console.log(row);
	}
	console.log();

	console.log("--- Indexes on entitlements ---\n");
	const indexes = await db.execute(sql`
		SELECT indexname, indexdef
		FROM pg_indexes
		WHERE tablename = 'entitlements'
		ORDER BY indexname
	`);
	for (const row of indexes) {
		console.log(row);
	}

	process.exit(0);
};

await main();
