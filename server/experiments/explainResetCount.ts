import "dotenv/config";
import { sql } from "drizzle-orm";
import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

const { initDrizzle } = await import("../src/db/initDrizzle");
const { buildCountResetEligibleQuery, countResetEligibleCustomerEntitlements } =
	await import(
		"../src/internal/customers/cusProducts/cusEnts/repos/countResetEligibleCustomerEntitlements"
	);

const main = async () => {
	const cap = Number(process.env.RESET_COUNT_CAP ?? 10_000);
	const dueBefore = Date.now();
	const { db } = initDrizzle();

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
