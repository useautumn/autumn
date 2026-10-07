/**
 * Read-mostly perf probe for concurrent per-customer chunks (keyset segments).
 * EXPLAIN (ANALYZE, BUFFERS) on the chunk page before/after a segment floor,
 * the parent's segment page, the hash-partition alternative, claim, checkpoint
 * anti-join and finalize counts. Seeds then deletes its own item-run rows.
 *
 *   bun tests/perf/batch-migrations/probes/probeSegmentPages.ts
 */

import {
	type CustomerPagePredicate,
	composeCustomerPage,
	MigrationItemRunStatus,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { buildCustomerSelect } from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import { rawWithParamsToDrizzle } from "@/internal/migrations/v2/filters/rawWithParamsToDrizzle.js";
import {
	BENCH_FREE_PRODUCT_ID,
	BENCH_PAID_PRODUCT_ID,
	getBenchContext,
} from "../utils/benchContext.js";

const PROBE_MIGRATION = "mig_probe_segments";
const PROBE_RUN = "mrun_probe_segments";
const CHUNK_PAGE = 100;
const SEGMENT_SIZE = 500;
const PARTITIONS = 4;
/** Other migrations' rows, so item-run selectivity resembles a shared prod table. */
const NOISE_MIGRATIONS = Array.from(
	{ length: 10 },
	(_, i) => `mig_probe_noise_${i + 1}`,
);

type PlanNode = {
	"Node Type": string;
	"Relation Name"?: string;
	"Index Name"?: string;
	"Shared Hit Blocks"?: number;
	"Shared Read Blocks"?: number;
	Plans?: PlanNode[];
};

type Explained = {
	ms: number;
	buffers: number;
	nodes: string[];
	seqScans: string[];
};

const bench = await getBenchContext();
const { ctx, org } = bench;
const { db } = ctx;
const ambient = { orgId: org.id, env: ctx.env };
const features = { features: ctx.features };
const out: string[] = [];
const log = (line = "") => {
	out.push(line);
	console.log(line);
};

const collectNodes = (node: PlanNode, acc: string[]) => {
	const target = [node["Relation Name"], node["Index Name"]]
		.filter(Boolean)
		.join(" / ");
	acc.push(target ? `${node["Node Type"]} (${target})` : node["Node Type"]);
	for (const child of node.Plans ?? []) collectNodes(child, acc);
	return acc;
};

type ExplainRow = {
	"QUERY PLAN": [{ Plan: PlanNode; "Execution Time": number }];
};

const explainWith = async ({
	execute,
	query,
}: {
	execute: (query: SQL) => Promise<unknown>;
	query: SQL;
}): Promise<Explained> => {
	const [row] = (await execute(
		sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
	)) as ExplainRow[];
	const [{ Plan, "Execution Time": ms }] = row["QUERY PLAN"];
	const nodes = [...new Set(collectNodes(Plan, []))];
	return {
		ms,
		buffers:
			(Plan["Shared Hit Blocks"] ?? 0) + (Plan["Shared Read Blocks"] ?? 0),
		nodes,
		seqScans: nodes.filter((node) => node.startsWith("Seq Scan")),
	};
};

const explain = (query: SQL) =>
	explainWith({ execute: (q) => db.execute(q), query });

/** Runs EXPLAIN ANALYZE in a transaction that always rolls back. */
const explainInRollback = async ({
	query,
	setup,
}: {
	query: SQL;
	setup?: SQL;
}): Promise<Explained> => {
	let result: Explained | undefined;
	await db
		.transaction(async (tx) => {
			if (setup) await tx.execute(setup);
			result = await explainWith({ execute: (q) => tx.execute(q), query });
			throw new Error("rollback");
		})
		.catch((error: Error) => {
			if (error.message !== "rollback") throw error;
		});
	if (!result) throw new Error("explain produced no plan");
	return result;
};

const report = (label: string, result: Explained) => {
	log(
		`| ${label} | ${result.ms.toFixed(1)} ms | ${result.buffers} | ${result.seqScans.length === 0 ? "none" : result.seqScans.join(", ")} |`,
	);
	return result;
};

const planFilter = (planId: string) => ({ plan: { plan_id: planId } });

const checkpoint = {
	migrationInternalId: PROBE_MIGRATION,
	migrationRunId: PROBE_RUN,
	dryRun: false,
	excludedStatuses: [
		MigrationItemRunStatus.Running,
		MigrationItemRunStatus.Succeeded,
		MigrationItemRunStatus.Skipped,
		MigrationItemRunStatus.Failed,
	],
};

const chunkPage = ({
	planId,
	limit,
	cursor,
	floor,
}: {
	planId: string;
	limit: number;
	cursor?: string;
	floor?: string;
}) =>
	buildCustomerSelect({
		orgId: org.id,
		env: ctx.env,
		filter: planFilter(planId),
		ctx: features,
		checkpoint,
		limit,
		afterInternalId: cursor,
		floorInternalId: floor,
	});

const pageIds = async (query: SQL) =>
	((await db.execute(query)) as { internal_id: string }[]).map(
		(row) => row.internal_id,
	);

const hashPage = ({
	planId,
	cursor,
	partition,
}: {
	planId: string;
	cursor?: string;
	partition?: number;
}) => {
	const predicates: CustomerPagePredicate[] =
		partition === undefined
			? []
			: [
					{
						build: (key) => ({
							sql: `abs(hashtext(${key})) % ${PARTITIONS} = ?`,
							params: [partition],
						}),
					},
				];
	return rawWithParamsToDrizzle(
		composeCustomerPage({
			filter: planFilter(planId),
			ctx: features,
			ambient,
			limit: CHUNK_PAGE,
			cursor,
			predicates,
		}),
	);
};

const seedCheckpointRows = async () => {
	await db.execute(
		sql`DELETE FROM migration_item_runs WHERE migration_internal_id = ${PROBE_MIGRATION}`,
	);
	await db.execute(sql`
		INSERT INTO migration_item_runs
			(migration_item_run_id, migration_internal_id, migration_run_id, dry_run, item_kind, item_id, status, created_at)
		SELECT 'mir_probe_' || c.internal_id, ${PROBE_MIGRATION}, ${PROBE_RUN}, false, 'customer', c.internal_id, 'succeeded', 0
		FROM customers c
		WHERE c.org_id = ${org.id} AND c.env = ${ctx.env} AND (hashtext(c.internal_id) & 1) = 0
		ON CONFLICT DO NOTHING
	`);
	for (const noise of NOISE_MIGRATIONS) {
		await db.execute(sql`
			INSERT INTO migration_item_runs
				(migration_item_run_id, migration_internal_id, migration_run_id, dry_run, item_kind, item_id, status, created_at)
			SELECT 'mir_' || ${noise} || '_' || c.internal_id, ${noise}, ${`${noise}_run`}, false, 'customer', c.internal_id, 'succeeded', 0
			FROM customers c
			WHERE c.org_id = ${org.id} AND c.env = ${ctx.env}
			ON CONFLICT DO NOTHING
		`);
	}
	await db.execute(sql`ANALYZE migration_item_runs`);
};

const main = async () => {
	const [{ customers }] = (await db.execute(
		sql`SELECT count(*)::int AS customers FROM customers WHERE org_id = ${org.id} AND env = ${ctx.env}`,
	)) as { customers: number }[];
	await seedCheckpointRows();
	const [{ itemRuns, productRows }] = (await db.execute(
		sql`SELECT (SELECT count(*)::int FROM migration_item_runs) AS "itemRuns", (SELECT count(*)::int FROM products) AS "productRows"`,
	)) as { itemRuns: number; productRows: number }[];
	log(
		`Bench: ${customers} customers, ${itemRuns} migration_item_runs rows across ${NOISE_MIGRATIONS.length + 1} migrations (half the bench customers checkpointed as succeeded for the probed one), ${productRows} products rows.`,
	);

	// Mid-keyset cursor so pages sit on the warm, realistic part of the walk.
	const [{ cursor }] = (await db.execute(sql`
		SELECT internal_id AS cursor FROM customers
		WHERE org_id = ${org.id} AND env = ${ctx.env}
		ORDER BY internal_id DESC OFFSET ${Math.floor(customers / 2)} LIMIT 1
	`)) as { cursor: string }[];

	for (const planId of [BENCH_FREE_PRODUCT_ID, BENCH_PAID_PRODUCT_ID]) {
		await pageIds(chunkPage({ planId, limit: CHUNK_PAGE, cursor }));
		const segmentIds = await pageIds(
			chunkPage({ planId, limit: SEGMENT_SIZE + 1, cursor }),
		);
		const floor = segmentIds[SEGMENT_SIZE - 1];

		log();
		log(`### Plan filter \`${planId}\` (mid-keyset cursor)`);
		log("| query | time | buffers | seq scans |");
		log("| --- | --- | --- | --- |");
		const before = report(
			"chunk page, P=1 (before): limit 100, cursor",
			await explain(chunkPage({ planId, limit: CHUNK_PAGE, cursor })),
		);
		const after = report(
			"chunk page, segment (after): limit 100, cursor + floor",
			await explain(chunkPage({ planId, limit: CHUNK_PAGE, cursor, floor })),
		);
		report(
			"parent segment page (after): limit 501, cursor",
			await explain(chunkPage({ planId, limit: SEGMENT_SIZE + 1, cursor })),
		);
		report(
			"hash alternative baseline: limit 100, no checkpoint",
			await explain(hashPage({ planId, cursor })),
		);
		report(
			`hash alternative: limit 100, hash % ${PARTITIONS} = 0`,
			await explain(hashPage({ planId, cursor, partition: 0 })),
		);
		log();
		log(`Before plan: ${before.nodes.join(" → ")}`);
		log(`After plan: ${after.nodes.join(" → ")}`);
	}

	await probeFullWalk();
	await probeConcurrentPages({ cursor });
	await probeClaimAndCounts();
};

/** Total buffers to walk an entire filter: P=1 keyset vs parent pages + segment chunks. */
const probeFullWalk = async () => {
	const planId = BENCH_PAID_PRODUCT_ID;
	let serialBuffers = 0;
	let serialPages = 0;
	let serialRows = 0;
	let cursor: string | undefined;
	while (true) {
		const query = chunkPage({ planId, limit: CHUNK_PAGE, cursor });
		serialBuffers += (await explain(query)).buffers;
		serialPages++;
		const ids = await pageIds(query);
		serialRows += ids.length;
		if (ids.length < CHUNK_PAGE) break;
		cursor = ids.at(-1);
	}

	let segmentBuffers = 0;
	let segmentPages = 0;
	let segmentRows = 0;
	let walkCursor: string | undefined;
	while (true) {
		const parent = chunkPage({
			planId,
			limit: SEGMENT_SIZE + 1,
			cursor: walkCursor,
		});
		segmentBuffers += (await explain(parent)).buffers;
		segmentPages++;
		const parentIds = await pageIds(parent);
		if (parentIds.length === 0) break;
		const isLast = parentIds.length <= SEGMENT_SIZE;
		const segmentIds = parentIds.slice(0, SEGMENT_SIZE);
		const floor = isLast ? undefined : segmentIds.at(-1);
		let chunkCursor = walkCursor;
		while (true) {
			const query = chunkPage({
				planId,
				limit: CHUNK_PAGE,
				cursor: chunkCursor,
				floor,
			});
			segmentBuffers += (await explain(query)).buffers;
			segmentPages++;
			const ids = await pageIds(query);
			segmentRows += ids.length;
			if (ids.length < CHUNK_PAGE) break;
			chunkCursor = ids.at(-1);
		}
		if (isLast) break;
		walkCursor = floor;
	}

	log();
	log(`### Full walk of \`${planId}\` (every unprocessed customer)`);
	log("| walk | queries | rows returned | total buffers |");
	log("| --- | --- | --- | --- |");
	log(
		`| P=1 keyset (before) | ${serialPages} | ${serialRows} | ${serialBuffers} |`,
	);
	log(
		`| parent segment pages + segment chunk pages (after) | ${segmentPages} | ${segmentRows} | ${segmentBuffers} |`,
	);
};

/** Wall time of P concurrent segment pages vs one P=1 page. */
const probeConcurrentPages = async ({ cursor }: { cursor: string }) => {
	const planId = BENCH_FREE_PRODUCT_ID;
	const boundaries = await pageIds(
		chunkPage({ planId, limit: SEGMENT_SIZE * PARTITIONS + 1, cursor }),
	);
	const segments = Array.from({ length: PARTITIONS }, (_, i) => ({
		cursor: i === 0 ? cursor : boundaries[i * SEGMENT_SIZE - 1],
		floor: boundaries[(i + 1) * SEGMENT_SIZE - 1],
	}));

	const time = async (run: () => Promise<unknown>) => {
		const start = performance.now();
		await run();
		return performance.now() - start;
	};
	for (let warm = 0; warm < 2; warm++)
		await Promise.all(
			segments.map((segment) =>
				pageIds(chunkPage({ planId, limit: CHUNK_PAGE, ...segment })),
			),
		);
	const serial = await time(() =>
		pageIds(chunkPage({ planId, limit: CHUNK_PAGE, cursor })),
	);
	const concurrent = await time(() =>
		Promise.all(
			segments.map((segment) =>
				pageIds(chunkPage({ planId, limit: CHUNK_PAGE, ...segment })),
			),
		),
	);
	const concurrentPlans = await Promise.all(
		segments.map((segment) =>
			explain(chunkPage({ planId, limit: CHUNK_PAGE, ...segment })),
		),
	);

	log();
	log(`### ${PARTITIONS} segment chunk pages at once (\`${planId}\`)`);
	log(
		`One P=1 page: ${serial.toFixed(1)} ms wall. ${PARTITIONS} concurrent segment pages: ${concurrent.toFixed(1)} ms wall; per-page ${concurrentPlans.map((plan) => `${plan.ms.toFixed(1)} ms / ${plan.buffers} buf`).join(", ")}; seq scans: ${concurrentPlans.flatMap((plan) => plan.seqScans).join(", ") || "none"}.`,
	);
};

/** Claim insert, retry upsert and finalize counts under P concurrent writers. */
const probeClaimAndCounts = async () => {
	const [{ customer }] = (await db.execute(sql`
		SELECT c.internal_id AS customer FROM customers c
		WHERE c.org_id = ${org.id} AND c.env = ${ctx.env}
			AND NOT EXISTS (SELECT 1 FROM migration_item_runs mir WHERE mir.item_id = c.internal_id AND mir.migration_internal_id = ${PROBE_MIGRATION})
		LIMIT 1
	`)) as { customer: string }[];
	const [{ claimed }] = (await db.execute(sql`
		SELECT item_id AS claimed FROM migration_item_runs
		WHERE migration_internal_id = ${PROBE_MIGRATION} LIMIT 1
	`)) as { claimed: string }[];

	const claimInsert = (itemId: string) => sql`
		INSERT INTO migration_item_runs
			(migration_item_run_id, migration_internal_id, migration_run_id, dry_run, item_kind, item_id, status, created_at)
		VALUES (${`mir_probe_claim_${itemId}`}, ${PROBE_MIGRATION}, ${PROBE_RUN}, false, 'customer', ${itemId}, 'running', 0)
		ON CONFLICT (migration_internal_id, item_kind, item_id) WHERE dry_run = false DO NOTHING
		RETURNING *`;
	const retryUpsert = (itemId: string) => sql`
		INSERT INTO migration_item_runs
			(migration_item_run_id, migration_internal_id, migration_run_id, dry_run, item_kind, item_id, status, created_at)
		VALUES (${`mir_probe_retry_${itemId}`}, ${PROBE_MIGRATION}, ${PROBE_RUN}, false, 'customer', ${itemId}, 'running', 0)
		ON CONFLICT (migration_internal_id, item_kind, item_id) WHERE dry_run = false
		DO UPDATE SET status = 'running', updated_at = 1
		WHERE migration_item_runs.status IN ('failed', 'skipped')
		RETURNING *`;
	const finalizeCounts = sql`
		SELECT count(*)::int AS total,
			count(*) FILTER (WHERE status = 'running')::int AS running,
			count(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
			count(*) FILTER (WHERE status = 'skipped')::int AS skipped,
			count(*) FILTER (WHERE status = 'failed')::int AS failed
		FROM migration_item_runs
		WHERE migration_internal_id = ${PROBE_MIGRATION} AND item_kind = 'customer' AND migration_run_id = ${PROBE_RUN}`;
	const finalizeCountsByLane = sql`
		SELECT count(*)::int AS total,
			count(*) FILTER (WHERE status = 'running')::int AS running,
			count(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
			count(*) FILTER (WHERE status = 'skipped')::int AS skipped,
			count(*) FILTER (WHERE status = 'failed')::int AS failed
		FROM migration_item_runs
		WHERE migration_internal_id = ${PROBE_MIGRATION} AND item_kind = 'customer' AND migration_run_id = ${PROBE_RUN}
			AND (dry_run = false OR dry_run = true)`;

	log();
	log(
		"### Claim and finalize (unchanged queries; P chunks issue them concurrently)",
	);
	log("| query | time | buffers | seq scans |");
	log("| --- | --- | --- | --- |");
	report(
		"claim insert, new item",
		await explainInRollback({ query: claimInsert(customer) }),
	);
	report(
		"claim insert, conflicting item",
		await explainInRollback({ query: claimInsert(claimed) }),
	);
	report(
		"retry upsert, conflicting item",
		await explainInRollback({ query: retryUpsert(claimed) }),
	);
	const counts = report(
		"finalize counts for the run (before)",
		await explain(finalizeCounts),
	);
	const countsByLane = report(
		"finalize counts for the run (after: one OR arm per dry_run partial index)",
		await explain(finalizeCountsByLane),
	);
	const forcedIndex = (query: SQL) =>
		explainInRollback({ query, setup: sql`SET LOCAL enable_seqscan = off` });
	const forcedBefore = report(
		"finalize counts (before), seq scans disabled",
		await forcedIndex(finalizeCounts),
	);
	const forcedAfter = report(
		"finalize counts (after), seq scans disabled",
		await forcedIndex(finalizeCountsByLane),
	);
	log();
	log(`Forced plan before: ${forcedBefore.nodes.join(" → ")}`);
	log(`Forced plan after: ${forcedAfter.nodes.join(" → ")}`);
	log(`Finalize counts plan before: ${counts.nodes.join(" → ")}`);
	log(`Finalize counts plan after: ${countsByLane.nodes.join(" → ")}`);
};

try {
	await main();
} finally {
	await db.execute(
		sql`DELETE FROM migration_item_runs WHERE migration_internal_id = ${PROBE_MIGRATION} OR migration_internal_id LIKE 'mig_probe_noise_%'`,
	);
	await Bun.write(
		`${process.env.HOME}/.capy/work/probe-segment-pages.md`,
		out.join("\n"),
	);
	process.exit(0);
}
