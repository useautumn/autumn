/**
 * Benchmarks a FULL chunked migration run — the layer above benchRunMigration,
 * which drives single pages. Covers the chunk loop (cursor handoff, budget
 * accounting, cancel checks) that nothing else measures.
 *
 * Two modes share one code path, one seed and one report so numbers compare:
 *
 *   --mode inline   (default) chunks run in-process. Fast, low-noise; use this
 *                   to iterate on chunk/page performance.
 *   --mode trigger  chunks run as real runMigrationChunkTask invocations on
 *                   your local `trigger.dev dev` worker, via runMigrationTask.
 *                   Validates the end-to-end path; slower and noisier.
 *
 *   bun tests/perf/batch-migrations/benchChunkedRun.ts
 *   bun tests/perf/batch-migrations/benchChunkedRun.ts --migration bench-mig-bench-paid-words
 *   bun tests/perf/batch-migrations/benchChunkedRun.ts --mode trigger --migration bench-mig-bench-paid-words
 *   bun tests/perf/batch-migrations/benchChunkedRun.ts --pages-per-chunk 5
 *
 * --pages-per-chunk overrides BATCH_MIGRATION_PAGES_PER_CHUNK for the run so
 * the chunk boundary can be swept without editing source (inline mode only —
 * trigger mode's chunk size lives in the task's own process).
 *
 * Reverts with revertBenchMigrations.ts. Requires seedBatchBench.ts first.
 */

import type { Migration } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { batchMigrationPlanToExecutionPlan } from "@/internal/migrations/v2/batchOperations/compute/index.js";
import { runBatchMigrationChunk } from "@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js";
import type { BatchMigrationPagePhases } from "@/internal/migrations/v2/batchOperations/execute/utils/pagePhaseTimings.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runMigrationInChunks } from "@/internal/migrations/v2/run/runMigrationInChunks.js";
import type {
	RunBatchMigrationChunkPayload,
	RunMigrationChunkPayload,
} from "@/internal/migrations/v2/run/types/migrationRunPayloads.js";
import { generateId } from "@/utils/genUtils.js";
import {
	BENCH_INTERNAL_CUSTOMER_PREFIX,
	getBenchContext,
} from "./utils/benchContext.js";

const DEFAULT_MIGRATION_ID = "bench-mig-bench-free-words";

/** How long to wait for a dev worker to pick the run up before giving up. */
const PICKUP_TIMEOUT_MS = 90_000;

const parseArgs = () => {
	const args = process.argv.slice(2);
	const get = (flag: string) => {
		const index = args.indexOf(flag);
		return index === -1 ? undefined : args[index + 1];
	};
	const mode = get("--mode") ?? "inline";
	if (mode !== "inline" && mode !== "trigger")
		throw new Error(`bench: --mode must be inline|trigger (got "${mode}")`);
	const pagesPerChunk = get("--pages-per-chunk");
	if (get("--limit") !== undefined)
		throw new Error(
			"bench: --limit forces the per-customer lane (isBatchEligibleRun requires " +
				"limit == null) and would not measure the batch lane. Size a run with " +
				"--migration against a smaller plan instead:\n" +
				"  bench-mig-bench-free-bare-words  (~30k customers)\n" +
				"  bench-mig-bench-paid-words       (~30k customers)\n" +
				"  bench-mig-bench-free-words       (~120k customers)",
		);
	return {
		mode,
		migrationId: get("--migration") ?? DEFAULT_MIGRATION_ID,
		pagesPerChunk:
			pagesPerChunk === undefined ? undefined : Number(pagesPerChunk),
		pollMs: Number(get("--poll-ms") ?? 2000),
	};
};

type ChunkTiming = {
	chunkIndex: number;
	ms: number;
	processed: number;
	pages: number;
	completion: string;
};

/** Bench-added rows only; seeded ce_bench_* rows are never touched. */
const resetBenchRows = async ({ ctx }: { ctx: AutumnContext }) => {
	const startedAt = Date.now();
	await ctx.db.execute(sql`
		DELETE FROM customer_entitlements
		WHERE internal_customer_id LIKE ${`${BENCH_INTERNAL_CUSTOMER_PREFIX}%`}
			AND id NOT LIKE 'ce_bench_%'
	`);
	await ctx.db.execute(sql`
		DELETE FROM migration_item_runs
		WHERE item_id LIKE ${`${BENCH_INTERNAL_CUSTOMER_PREFIX}%`}
	`);
	console.log(`bench: pre-run cleanup done in ${Date.now() - startedAt}ms`);
};

const aggregatePhases = ({
	into,
	from,
}: {
	into: BatchMigrationPagePhases;
	from: BatchMigrationPagePhases | undefined;
}) => {
	if (!from) return;
	for (const [phase, ms] of Object.entries(from)) {
		into[phase] = (into[phase] ?? 0) + ms;
	}
};

/** In-process chunk runner: same function runMigrationChunkTask calls, minus
 * the queue — so chunk-loop cost is measured without scheduling noise. */
const runInlineMode = async ({
	ctx,
	migration,
	migrationRunId,
	pagesPerChunk,
}: {
	ctx: AutumnContext;
	migration: Migration;
	migrationRunId: string;
	pagesPerChunk?: number;
}) => {
	const chunkTimings: ChunkTiming[] = [];
	const phases: BatchMigrationPagePhases = {};

	const result = await runMigrationInChunks({
		ctx,
		migration,
		migrationRunId,
		dryRun: false,
		runBatchChunk: async (payload: RunBatchMigrationChunkPayload) => {
			const startedAt = Date.now();
			const chunk = await runBatchMigrationChunk({
				ctx,
				migration: payload.migration,
				migrationRunId: payload.migrationRunId,
				plan: payload.plan,
				afterInternalId: payload.cursor,
				...(pagesPerChunk === undefined ? {} : { maxPages: pagesPerChunk }),
				webhooks: payload.webhooks,
				controls: payload.controls,
			});
			const ms = Date.now() - startedAt;
			aggregatePhases({ into: phases, from: chunk.summary.phases });
			chunkTimings.push({
				chunkIndex: payload.chunkIndex,
				ms,
				processed: chunk.processed,
				pages: chunk.summary.pages,
				completion: chunk.completion,
			});
			console.log(
				`bench: chunk ${payload.chunkIndex} — ${chunk.processed.toLocaleString()} customers, ${chunk.summary.pages} pages in ${ms}ms (${chunk.completion})`,
			);
			return chunk;
		},
		// Per-customer lane should never engage for a batch-eligible migration;
		// fail loudly rather than silently benchmarking the wrong lane.
		runChunk: async (payload: RunMigrationChunkPayload) => {
			throw new Error(
				`bench: per-customer lane engaged at chunk ${payload.chunkIndex} — this ` +
					"bench measures the BATCH lane. `--limit` makes a run batch-ineligible " +
					"(isBatchEligibleRun requires limit == null); scope with `--migration` " +
					"against a smaller plan instead.",
			);
		},
	});

	return { result, chunkTimings, phases };
};

/** Real trigger path: claims the run row then triggers runMigrationTask
 * exactly as handleRunMigration does, and polls migration_runs to completion.
 * The claim is what creates the row the task later updates — triggering
 * without it leaves the task updating a row that does not exist. */
const runTriggerMode = async ({
	ctx,
	migration,
	pollMs,
}: {
	ctx: AutumnContext;
	migration: Migration;
	pollMs: number;
}) => {
	const { isTriggerConfigured } = await import("@/trigger/configureTrigger.js");
	if (!isTriggerConfigured())
		throw new Error(
			"bench: TRIGGER_SERVER_SECRET_KEY not set — trigger mode needs autumn's " +
				"trigger key (NOT TRIGGER_SECRET_KEY, which belongs to autumn-cloud)",
		);

	const { runMigrationTask } = await import(
		"@/trigger/migrations/runMigrationTask/runMigrationTask.js"
	);
	const { migrationRunConcurrencyKey, getMigrationTriggerOptions } =
		await import("@/trigger/migrations/migrationTaskQueue.js");
	const { withMigrationRunClaim } = await import(
		"@/internal/migrations/v2/actions/migrationRun/index.js"
	);

	const isDev = process.env.NODE_ENV === "development";
	const { migrationRunId, triggerRunId } = await withMigrationRunClaim({
		ctx,
		migration,
		dryRun: false,
		claimed: async (claimedRunId) => {
			const handle = await runMigrationTask.trigger(
				{
					orgId: ctx.org.id,
					env: ctx.env,
					migrationId: migration.id,
					migrationRunId: claimedRunId,
					dryRun: false,
					lazyRun: false,
				},
				{
					...getMigrationTriggerOptions({ isDev }),
					concurrencyKey: migrationRunConcurrencyKey({
						orgId: ctx.org.id,
						env: ctx.env,
						dryRun: false,
					}),
				},
			);
			return { triggerRunId: handle.id };
		},
	});

	console.log(
		`bench: triggered run=${migrationRunId} trigger_run_id=${triggerRunId}`,
	);
	console.log(
		"bench: polling migration_runs (needs a live trigger.dev dev worker)",
	);

	const startedAt = Date.now();
	let lastProcessed = -1;
	let sawRunning = false;
	while (true) {
		await new Promise((resolve) => setTimeout(resolve, pollMs));

		if (!sawRunning && Date.now() - startedAt > PICKUP_TIMEOUT_MS) {
			throw new Error(
				`bench: run still queued after ${PICKUP_TIMEOUT_MS / 1000}s — no trigger.dev ` +
					"dev worker picked it up. Start one with `bunx trigger.dev dev`.",
			);
		}

		const [run] = (await ctx.db.execute(sql`
			SELECT status, error_message, started_at, finished_at
			FROM migration_runs WHERE internal_id = ${migrationRunId}
		`)) as Array<{
			status: string;
			error_message: string | null;
			started_at: number | null;
			finished_at: number | null;
		}>;

		const [{ n: processed }] = (await ctx.db.execute(sql`
			SELECT count(*) AS n FROM migration_item_runs
			WHERE migration_run_id = ${migrationRunId}
		`)) as Array<{ n: bigint | number }>;

		if (run?.status === "running") sawRunning = true;

		if (Number(processed) !== lastProcessed) {
			lastProcessed = Number(processed);
			console.log(
				`bench: [${Math.round((Date.now() - startedAt) / 1000)}s] status=${run?.status} item_runs=${lastProcessed.toLocaleString()}`,
			);
		}

		// `queued` is pre-pickup, not terminal — keep polling until the worker
		// takes it, otherwise a slow dev worker reads as an instant finish.
		if (run && run.status !== "running" && run.status !== "queued") {
			return {
				status: run.status,
				errorMessage: run.error_message,
				processed: Number(processed),
				wallMs: Date.now() - startedAt,
				migrationRunId,
				triggerRunId,
			};
		}
	}
};

const main = async () => {
	const { mode, migrationId, pagesPerChunk, pollMs } = parseArgs();
	const { ctx } = await getBenchContext();

	const migration = await migrationRepo.find({ ctx, id: migrationId });
	if (!migration.operations)
		throw new Error(`bench: migration ${migrationId} has no operations`);

	await resetBenchRows({ ctx });

	console.log(
		`bench: mode=${mode} migration=${migrationId}${
			pagesPerChunk ? ` pagesPerChunk=${pagesPerChunk}` : ""
		}`,
	);

	if (mode === "trigger") {
		const outcome = await runTriggerMode({ ctx, migration, pollMs });
		console.log("bench: ─────────────────────────────────────────");
		console.log(
			`bench: run ${outcome.status}${outcome.errorMessage ? ` — ${outcome.errorMessage}` : ""}`,
		);
		console.log(
			`bench: ${outcome.processed.toLocaleString()} item runs in ${outcome.wallMs}ms — ${
				outcome.wallMs > 0
					? Math.round(
							(outcome.processed / outcome.wallMs) * 1000,
						).toLocaleString()
					: 0
			} customers/s (end-to-end, includes queue + worker startup)`,
		);
		console.log(
			`bench: run=${outcome.migrationRunId} trigger_run_id=${outcome.triggerRunId}`,
		);
		process.exit(outcome.status === "succeeded" ? 0 : 1);
	}

	const migrationRunId = generateId("mrun");
	console.log(`bench: run=${migrationRunId}`);
	const startedAt = Date.now();
	const { result, chunkTimings, phases } = await runInlineMode({
		ctx,
		migration,
		migrationRunId,
		pagesPerChunk,
	});
	const totalMs = Date.now() - startedAt;

	const totalPages = chunkTimings.reduce((sum, c) => sum + c.pages, 0);
	const chunkMs = chunkTimings.reduce((sum, c) => sum + c.ms, 0);
	const phaseBreakdown = Object.entries(phases)
		.sort(([, a], [, b]) => b - a)
		.map(([phase, ms]) => `${phase}=${ms}ms`)
		.join(" ");

	console.log("bench: ─────────────────────────────────────────");
	console.log(
		`bench: TOTAL ${result.processed.toLocaleString()} customers across ${chunkTimings.length} chunks / ${totalPages} pages${result.canceled ? " (CANCELED)" : ""}`,
	);
	console.log(
		`bench: ${totalMs}ms wall — ${
			totalMs > 0
				? Math.round((result.processed / totalMs) * 1000).toLocaleString()
				: 0
		} customers/s`,
	);
	console.log(
		`bench: chunk work ${chunkMs}ms, loop overhead ${totalMs - chunkMs}ms (${
			totalMs > 0 ? (((totalMs - chunkMs) / totalMs) * 100).toFixed(1) : 0
		}% — prepare + lane decision + cursor handoff)`,
	);
	// finalize is a PARENT of finalize_caches/finalize_events — do not sum.
	if (phaseBreakdown) console.log(`bench: phases: ${phaseBreakdown}`);
	process.exit(0);
};

await main();
