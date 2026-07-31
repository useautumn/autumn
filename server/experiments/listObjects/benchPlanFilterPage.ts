import { AppEnv, type CusProductStatus } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { initDrizzle } from "../../src/db/initDrizzle.js";
import { RELEVANT_STATUSES } from "../../src/internal/customers/cusProducts/CusProductService.js";
import { getPaginatedEntitySubjectsQuery } from "../../src/internal/entities/repos/listEntitiesQuery.js";

/**
 * The plan-filtered page query, which as a correlated EXISTS took 176s and
 * 197.6M buffer reads to return 20 rows on mintlify.
 *
 * Run with:
 *   infisical run --env=prod --recursive -- bun run server/experiments/listObjects/benchPlanFilterPage.ts
 */
const ORG_ID = process.env.ORG_ID || "GG6tnmO7cHb40PNhwYBTZtxQdeL74NHF";
const ENV = (process.env.ENV as AppEnv) || AppEnv.Live;
const PLAN_ID = process.env.PLAN_ID || "enterprise";
const LIMIT = Number(process.env.LIMIT || 20);
const OFFSET = Number(process.env.OFFSET || 0);

const main = async () => {
	const { db } = initDrizzle({ maxConnections: 2 });

	const query = getPaginatedEntitySubjectsQuery({
		orgId: ORG_ID,
		env: ENV,
		// biome-ignore lint/suspicious/noExplicitAny: exercising the real param shape
		query: {
			limit: LIMIT,
			offset: OFFSET,
			plans: [{ id: PLAN_ID }],
		} as any,
		inStatuses: RELEVANT_STATUSES as CusProductStatus[],
	});

	const startedAt = performance.now();
	const rows = await db.execute(query);
	const wallMs = performance.now() - startedAt;

	const explainRows = await db.execute<Record<string, unknown>>(
		sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}`,
	);
	const plan = explainRows.map((row) => String(row["QUERY PLAN"])).join("\n");

	console.log(
		`page query, plans:[${PLAN_ID}], limit=${LIMIT} offset=${OFFSET}\n` +
			`  rows returned: ${rows.length}\n` +
			`  wall clock:    ${(wallMs / 1000).toFixed(3)}s\n` +
			`  pg execution:  ${(Number(plan.match(/Execution Time: ([\d.]+) ms/)?.[1] ?? 0) / 1000).toFixed(3)}s\n` +
			`  buffers:       ${plan.match(/Buffers: shared hit=(\d+)/)?.[1] ?? "?"}`,
	);

	process.exit(0);
};

await main();
