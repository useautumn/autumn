import { AppEnv, type CusProductStatus } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { initDrizzle } from "../../src/db/initDrizzle.js";
import { RELEVANT_STATUSES } from "../../src/internal/customers/cusProducts/CusProductService.js";
import { getCursorPaginatedEntitySubjectsQuery } from "../../src/internal/entities/repos/cursorListEntitiesQuery.js";

/**
 * The cursor (API 2.3.0) page query still filters plans with a correlated
 * EXISTS. Same shape as the offset path before the plan_scopes join, so this
 * measures whether it has the same problem.
 *
 * Run with:
 *   infisical run --env=prod --recursive -- bun run server/experiments/listObjects/benchPlanFilterCursor.ts
 */
const ORG_ID = process.env.ORG_ID || "GG6tnmO7cHb40PNhwYBTZtxQdeL74NHF";
const ENV = (process.env.ENV as AppEnv) || AppEnv.Live;
const PLAN_ID = process.env.PLAN_ID || "enterprise";
const LIMIT = Number(process.env.LIMIT || 20);

const main = async () => {
	const { db } = initDrizzle({ maxConnections: 2 });

	const query = getCursorPaginatedEntitySubjectsQuery({
		orgId: ORG_ID,
		env: ENV,
		limit: LIMIT,
		cursor: null,
		inStatuses: RELEVANT_STATUSES as CusProductStatus[],
		plans: [{ id: PLAN_ID }],
	});

	const startedAt = performance.now();
	const rows = await db.execute(query);
	const wallMs = performance.now() - startedAt;

	const explainRows = await db.execute<Record<string, unknown>>(
		sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}`,
	);
	const plan = explainRows.map((row) => String(row["QUERY PLAN"])).join("\n");

	console.log(
		`cursor page query, plans:[${PLAN_ID}], limit=${LIMIT}\n` +
			`  rows returned: ${rows.length}\n` +
			`  wall clock:    ${(wallMs / 1000).toFixed(3)}s\n` +
			`  pg execution:  ${(Number(plan.match(/Execution Time: ([\d.]+) ms/)?.[1] ?? 0) / 1000).toFixed(3)}s\n` +
			`  buffers:       ${plan.match(/Buffers: shared hit=(\d+)/)?.[1] ?? "?"}`,
	);
	process.exit(0);
};

await main();
