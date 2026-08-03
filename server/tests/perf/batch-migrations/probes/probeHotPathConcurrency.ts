/**
 * Hot-path collision probe: hammers real getFullSubject reads (full query +
 * normalization + lazy paths) and syncItemV4-style balance UPDATEs on the
 * SAME customers a live batch migration is inserting rows for — measuring
 * hot-path latency idle vs during migration. Revert with
 * revertBenchMigrations.ts.
 *
 *   bun tests/perf/batch-migrations/probes/probeHotPathConcurrency.ts
 */

import { sql } from "drizzle-orm";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/getFullSubject.js";
import { batchMigrationPlanToExecutionPlan } from "@/internal/migrations/v2/batchOperations/compute/index.js";
import { runBatchMigrationChunk } from "@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js";
import { prepareMigration } from "@/internal/migrations/v2/run/runMigration.js";
import { shouldRunBatchLane } from "@/internal/migrations/v2/utils/shouldRunBatchLane.js";
import { generateId } from "@/utils/genUtils.js";
import {
	BENCH_INTERNAL_CUSTOMER_PREFIX,
	getBenchContext,
} from "../utils/benchContext.js";

const MIGRATION_ID = "bench-mig-bench-free-words";
// bench-free claim order starts at the top of text-DESC: ids 9xxxxx first.
// The hammer pool overlaps the first ~10 pages' customers.
const POOL_MIN = 950_000;
const POOL_MAX = 999_999;
const READERS = 3;
const SYNC_WRITERS = 2;
const IDLE_WINDOW_MS = 12_000;
const MIGRATION_PAGES = 10;

const randomPoolId = () =>
	POOL_MIN + Math.floor(Math.random() * (POOL_MAX - POOL_MIN + 1));

const percentile = (sorted: number[], p: number) =>
	sorted.length === 0 ? 0 : sorted[Math.floor((sorted.length - 1) * p)];

const summarize = (label: string, latencies: number[]) => {
	const sorted = [...latencies].sort((a, b) => a - b);
	console.log(
		`  ${label}: n=${sorted.length.toLocaleString()} p50=${percentile(sorted, 0.5)}ms p95=${percentile(sorted, 0.95)}ms p99=${percentile(sorted, 0.99)}ms max=${sorted[sorted.length - 1] ?? 0}ms`,
	);
};

const main = async () => {
	const bench = await getBenchContext();
	const { ctx, org } = bench;
	const { db } = ctx;

	// Fresh slate for the migration's feature.
	await db.execute(sql`
		DELETE FROM customer_entitlements
		WHERE internal_customer_id LIKE ${`${BENCH_INTERNAL_CUSTOMER_PREFIX}%`}
			AND feature_id = 'words' AND id NOT LIKE 'ce_bench_%'
	`);
	await db.execute(sql`
		DELETE FROM migration_item_runs
		WHERE item_id LIKE ${`${BENCH_INTERNAL_CUSTOMER_PREFIX}%`}
	`);

	const [migrationRow] = (await db.execute(sql`
		SELECT * FROM migrations
		WHERE org_id = ${org.id} AND env = ${ctx.env} AND id = ${MIGRATION_ID}
	`)) as Record<string, unknown>[];
	if (!migrationRow) throw new Error(`${MIGRATION_ID} missing — seed first`);

	const preparedMigration = await prepareMigration({
		ctx,
		// biome-ignore lint/suspicious/noExplicitAny: raw row → prepare parses
		migration: migrationRow as any,
		dryRun: false,
	});
	const migrationRunId = generateId("bench_run");
	const lane = await shouldRunBatchLane({
		ctx,
		migration: preparedMigration,
		migrationRunId,
		dryRun: false,
		controls: undefined,
		hasCustomHooks: false,
		hasCloudBatchAdapter: false,
	});
	if (!lane.shouldRun) throw new Error("batch lane rejected");
	const plan = batchMigrationPlanToExecutionPlan({ plan: lane.plan });

	const runHammer = async ({ label, untilMs, until }: {
		label: string;
		untilMs?: number;
		until?: () => boolean;
	}) => {
		const readLatencies: number[] = [];
		const writeLatencies: number[] = [];
		let readErrors = 0;
		const deadline = Date.now() + (untilMs ?? 0);
		const shouldStop = () =>
			until ? until() : Date.now() >= deadline;

		const readers = Array.from({ length: READERS }, async () => {
			while (!shouldStop()) {
				const started = Date.now();
				try {
					await getFullSubject({
						ctx,
						customerId: `bench-c-${randomPoolId()}`,
					});
				} catch {
					readErrors++;
				}
				readLatencies.push(Date.now() - started);
			}
		});
		const writers = Array.from({ length: SYNC_WRITERS }, async () => {
			while (!shouldStop()) {
				const started = Date.now();
				// syncItemV4's DB effect: a balance flush on an existing cusEnt
				// (no cache_version bump — runtime patch semantics).
				await db.execute(sql`
					UPDATE customer_entitlements
					SET balance = balance - 1
					WHERE id = ${`ce_bench_${randomPoolId()}`}
				`);
				writeLatencies.push(Date.now() - started);
			}
		});

		await Promise.all([...readers, ...writers]);
		console.log(`■ ${label}`);
		summarize("getFullSubject reads", readLatencies);
		summarize("sync balance writes ", writeLatencies);
		if (readErrors > 0) console.log(`  read errors: ${readErrors}`);
	};

	console.log("baseline (migration idle)…");
	await runHammer({ label: "IDLE", untilMs: IDLE_WINDOW_MS });

	console.log(`\nstarting migration (${MIGRATION_PAGES} pages) + hammer…`);
	let migrationDone = false;
	const migrationStarted = Date.now();
	const migrationPromise = runBatchMigrationChunk({
		ctx,
		migration: preparedMigration,
		migrationRunId,
		plan,
		maxPages: MIGRATION_PAGES,
	}).finally(() => {
		migrationDone = true;
	});

	await runHammer({
		label: "DURING MIGRATION",
		until: () => migrationDone,
	});
	const migrationResult = await migrationPromise;
	console.log(
		`  migration: ${migrationResult.processed.toLocaleString()} customers, ${migrationResult.summary.pages} pages in ${Date.now() - migrationStarted}ms`,
	);
	console.log(
		`  phases: ${Object.entries(migrationResult.summary.phases)
			.sort(([, a], [, b]) => b - a)
			.map(([phase, ms]) => `${phase}=${ms}ms`)
			.join(" ")}`,
	);
	process.exit(0);
};

await main();
