import "dotenv/config";
import { sql } from "drizzle-orm";
import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

const { initDrizzle } = await import("../src/db/initDrizzle");
const { buildCountResetEligibleQuery, countResetEligibleCustomerEntitlements } =
	await import(
		"../src/internal/customers/cusProducts/cusEnts/repos/countResetEligibleCustomerEntitlements"
	);

// Benchmarks the diagnostic capped count; the runtime reset gauge does not use it.
// Run with `bun run experiments/explainResetCount.ts`; RESET_COUNT_CAP defaults to 10k.

const main = async () => {
	const cap = Number(process.env.RESET_COUNT_CAP ?? 10_000);
	const dueBefore = Date.now();
	const { db } = initDrizzle();

	// The bunfig preload overlays server/.env.local (worktree Neon branch) on
	// top of Infisical — run with PW_MODE=1 to skip the overlay and hit the
	// Infisical-provided DB (e.g. prod).
	const dbHost = new URL(process.env.DATABASE_URL ?? "").host;
	console.log(`DB target: ${dbHost}\n`);

	for (const run of ["cold", "warm"]) {
		const start = performance.now();
		const result = await countResetEligibleCustomerEntitlements({
			db,
			dueBefore,
			cap,
		});
		const elapsed = performance.now() - start;
		console.log(
			`[count][${run}] count=${result.count}, capped=${result.capped}, wall-clock=${elapsed.toFixed(0)}ms`,
		);
	}

	console.log("\n--- EXPLAIN (ANALYZE, BUFFERS) ---");
	const explainResult = await db.execute(
		sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${buildCountResetEligibleQuery({ dueBefore, cap })}`,
	);
	for (const row of explainResult) {
		const line = (row as Record<string, unknown>)["QUERY PLAN"];
		if (typeof line === "string") console.log(line);
	}

	process.exit(0);
};

await main();
