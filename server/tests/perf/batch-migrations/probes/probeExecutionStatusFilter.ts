/**
 * Probes the execution-status filter (dashboard "filter by succeeded/failed")
 * against the DEV bench org: correctness of returned rows + EXPLAIN shape.
 *
 * Run: infisical run --env=dev --recursive -- bun server/tests/perf/batch-migrations/probes/probeExecutionStatusFilter.ts
 */
import { sql } from "drizzle-orm";
import {
	buildProcessedPreviewCount,
	buildProcessedPreviewSelect,
} from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import { getBenchContext } from "../utils/benchContext.js";

const STATEMENT_TIMEOUT_MS = 30_000;

const main = async () => {
	const { ctx, org } = await getBenchContext();
	const db = ctx.db;

	const [migration] = (await db.execute(sql`
		SELECT internal_id, id FROM migrations
		WHERE org_id = ${org.id} AND env = ${ctx.env}
		ORDER BY created_at DESC LIMIT 1
	`)) as Array<{ internal_id: string; id: string }>;
	if (!migration) throw new Error("no bench migration found");

	const [mirCounts] = (await db.execute(sql`
		SELECT count(*)::int AS total,
			count(*) FILTER (WHERE status = 'succeeded')::int AS succeeded
		FROM migration_item_runs
		WHERE migration_internal_id = ${migration.internal_id} AND dry_run = false
	`)) as Array<{ total: number; succeeded: number }>;
	console.log(
		`migration ${migration.internal_id}: mir total=${mirCounts.total} succeeded=${mirCounts.succeeded}`,
	);

	const args = {
		orgId: org.id,
		env: ctx.env,
		filter: {
			plan: { plan_id: "bench-fanout-shape", custom: false },
		} as never,
		ctx: { features: ctx.features },
		includeProcessed: {
			migrationInternalId: migration.internal_id,
			executionFilter: { statuses: ["succeeded" as const] },
		},
	};

	await db.transaction(async (tx) => {
		await tx.execute(
			sql.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`),
		);

		const select = buildProcessedPreviewSelect({ ...args, limit: 5 });
		const started = Date.now();
		const rows = (await tx.execute(select)) as unknown as Array<{
			internal_id: string;
		}>;
		console.log(
			`select(succeeded, limit 5): ${rows.length} rows in ${Date.now() - started}ms`,
		);
		console.log(rows.map((r) => r.internal_id).join(", "));

		const countStarted = Date.now();
		const [{ count }] = (await tx.execute(
			buildProcessedPreviewCount(args),
		)) as unknown as Array<{ count: bigint }>;
		console.log(
			`count(succeeded): ${count} in ${Date.now() - countStarted}ms`,
		);

		// Proposed shape: drive from the mir index, join customers only for the page.
		const proposedSelect = sql`
			SELECT c.internal_id, c.id, c.name, c.email
			FROM (
				SELECT DISTINCT ON (mir.item_id COLLATE "C") mir.item_id
				FROM migration_item_runs mir
				WHERE mir.migration_internal_id = ${migration.internal_id}
					AND mir.item_kind = 'customer' AND mir.dry_run = false
					AND mir.status IN ('succeeded')
				ORDER BY mir.item_id COLLATE "C" DESC
				LIMIT 5
			) ids
			JOIN customers c ON c.internal_id = ids.item_id
			ORDER BY c.internal_id DESC
		`;
		const proposedStarted = Date.now();
		const proposedRows = (await tx.execute(proposedSelect)) as unknown as Array<{
			internal_id: string;
		}>;
		console.log(
			`proposed select: ${proposedRows.length} rows in ${Date.now() - proposedStarted}ms`,
		);
		console.log(proposedRows.map((r) => r.internal_id).join(", "));

		const proposedCount = sql`
			SELECT COUNT(DISTINCT mir.item_id)::bigint AS count
			FROM migration_item_runs mir
			WHERE mir.migration_internal_id = ${migration.internal_id}
				AND mir.item_kind = 'customer' AND mir.dry_run = false
				AND mir.status IN ('succeeded')
		`;
		const proposedCountStarted = Date.now();
		const [{ count: proposedCountValue }] = (await tx.execute(
			proposedCount,
		)) as unknown as Array<{ count: bigint }>;
		console.log(
			`proposed count: ${proposedCountValue} in ${Date.now() - proposedCountStarted}ms`,
		);

		for (const [label, query] of [
			["current select", select],
			["proposed select", proposedSelect],
		] as const) {
			const plan = (await tx.execute(
				sql`EXPLAIN (VERBOSE, FORMAT TEXT) ${query}`,
			)) as unknown as Array<Record<string, string>>;
			console.log(`--- plan (${label}) ---`);
			for (const line of plan) console.log(Object.values(line)[0]);
		}
	});
};

await main();
process.exit(0);
