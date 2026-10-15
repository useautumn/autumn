/**
 * Bench-only: the same remove-items batch migration on the SQL path vs the
 * balance-worker path (#4929). Seeds N customers each holding Messages (removed)
 * and Words (kept), warms every customer into the worker, then runs the whole
 * migration in one chunk with BALANCE_WORKER_ROLLOUT_ENABLED forced per path.
 *
 *   bun tests/perf/batch-migrations/benchRunWorkerRemove.ts --path worker --customers 5000
 *
 * Worker send concurrency comes from BENCH_WORKER_SEND_CONCURRENCY (bench branch only).
 * Pass --worker-pid and --pg-cgroup to sample their CPU over the migration window.
 */

import { readFileSync, writeFileSync } from "node:fs";
import {
	orgToCommandOrg,
	parseReadSubjectStateCommand,
} from "@autumn/balance-engine";
import { type Migration, migrations } from "@autumn/shared";
import { MigrationFilterSchema } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import { OperationsSchema } from "@autumn/shared/api/migrations/operations/operations.js";
import { TestFeature } from "@tests/setup/v2Features";
import { sql } from "drizzle-orm";
import {
	getBalanceWorkerClient,
	startBalanceWorkerClient,
} from "@/external/balanceWorker/getBalanceWorkerClient.js";
import { requestContextToCommandBase } from "@/internal/balances/balanceWorker/requestContextToCommandBase.js";
import { batchMigrationPlanToExecutionPlan } from "@/internal/migrations/v2/batchOperations/compute/index.js";
import { runBatchMigrationChunk } from "@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js";
import { BATCH_MIGRATION_WORKER_SEND_CONCURRENCY } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";
import { prepareMigration } from "@/internal/migrations/v2/run/runMigration.js";
import { shouldRunBatchLane } from "@/internal/migrations/v2/utils/shouldRunBatchLane.js";
import { generateId } from "@/utils/genUtils.js";
import { getBenchContext } from "./utils/benchContext.js";
import {
	type BenchPlanItemPrefixes,
	ensureBenchPlanItemProduct,
	seedBenchPlanItems,
} from "./utils/seedBenchPlanItems.js";

const BENCH_INTERNAL_CUSTOMER_BASE = "cus_bench_wrm_";
// Fresh ids per run: a previous run's finalize queues worker evicts for its customers, which would evict this run's warm subjects.
const RUN_TAG = Date.now().toString(36);
const PREFIXES: BenchPlanItemPrefixes = {
	productId: "bench-worker-remove",
	customerId: `bench-wrm-${RUN_TAG}-c-`,
	internalCustomer: `${BENCH_INTERNAL_CUSTOMER_BASE}${RUN_TAG}_`,
	customerProduct: `cp_bench_wrm_${RUN_TAG}_`,
	entitlement: `ce_bench_wrm_msg_${RUN_TAG}_`,
};
const KEPT_ENTITLEMENT_PREFIX = `ce_bench_wrm_kept_${RUN_TAG}_`;
const SEED_STARTS_AT = Date.UTC(2026, 8, 20);
const WORDS_SEED_BALANCE = 60;

/** 1 op: remove Messages. 3 ops: remove Messages, replace Words 100→200, add Action1. */
const customizeFor = ({ ops }: { ops: 1 | 3 }) =>
	ops === 1
		? { remove_items: [{ feature_id: TestFeature.Messages }] }
		: {
				remove_items: [
					{ feature_id: TestFeature.Messages },
					{
						feature_id: TestFeature.Words,
						interval: "month",
						interval_count: 1,
					},
				],
				add_items: [
					{
						feature_id: TestFeature.Words,
						included: 200,
						reset: { interval: "month" },
					},
					{
						feature_id: TestFeature.Action1,
						included: 50,
						reset: { interval: "month" },
					},
				],
			};
const WARM_CONCURRENCY = 64;
const CLOCK_TICKS_PER_SECOND = 100;

const parseArgs = () => {
	const args = process.argv.slice(2);
	const get = (flag: string) => {
		const index = args.indexOf(flag);
		return index === -1 ? undefined : args[index + 1];
	};
	const path = get("--path");
	if (path !== "sql" && path !== "worker" && path !== "plan")
		throw new Error("--path sql|worker|plan is required");
	const ops = Number(get("--ops") ?? "1");
	if (ops !== 1 && ops !== 3) throw new Error("--ops 1|3");
	return {
		path,
		ops,
		customers: Number(get("--customers") ?? "1000"),
		workerPid: get("--worker-pid"),
		pgCgroup: get("--pg-cgroup"),
		out: get("--out"),
		skipWarm: args.includes("--skip-warm"),
	} as const;
};

const workerCpuSeconds = (pid: string | undefined) => {
	if (!pid) return null;
	const fields = readFileSync(`/proc/${pid}/stat`, "utf8")
		.split(") ")[1]
		.split(" ");
	return (Number(fields[11]) + Number(fields[12])) / CLOCK_TICKS_PER_SECOND;
};

const cgroupCpuSeconds = (cgroup: string | undefined) => {
	if (!cgroup) return null;
	const line = readFileSync(`${cgroup}/cpu.stat`, "utf8")
		.split("\n")
		.find((entry) => entry.startsWith("usage_usec"));
	return Number(line?.split(" ")[1]) / 1e6;
};

const machineCpuTicks = () => {
	const [, ...fields] = readFileSync("/proc/stat", "utf8")
		.split("\n")[0]
		.split(/\s+/);
	const ticks = fields.map(Number);
	return {
		busy: ticks.reduce((a, b) => a + b, 0) - ticks[3] - ticks[4],
		total: ticks.reduce((a, b) => a + b, 0),
	};
};

const percentile = (sorted: number[], p: number) =>
	sorted.length === 0
		? null
		: sorted[
				Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
			];

const main = async () => {
	const args = parseArgs();
	process.env.BALANCE_WORKER_ROLLOUT_ENABLED =
		args.path === "sql" ? "false" : "true";
	process.env.BENCH_PLAN_PER_CUSTOMER = args.path === "plan" ? "1" : "0";
	const { ctx, org, benchProducts } = await getBenchContext();
	const { db } = ctx;
	const features = ctx.features;
	const words = features.find((feature) => feature.id === TestFeature.Words);
	if (!words) throw new Error("bench: words feature missing");

	await db.execute(sql`
		DELETE FROM customer_entitlements WHERE internal_customer_id LIKE ${`${BENCH_INTERNAL_CUSTOMER_BASE}%`}
	`);
	await db.execute(sql`
		DELETE FROM customer_products WHERE internal_customer_id LIKE ${`${BENCH_INTERNAL_CUSTOMER_BASE}%`}
	`);
	await db.execute(sql`
		DELETE FROM migration_item_runs WHERE item_id LIKE ${`${BENCH_INTERNAL_CUSTOMER_BASE}%`}
	`);
	await db.execute(sql`
		DELETE FROM customers WHERE internal_id LIKE ${`${BENCH_INTERNAL_CUSTOMER_BASE}%`}
	`);

	const removed = await ensureBenchPlanItemProduct({
		db,
		orgId: org.id,
		env: ctx.env,
		internalFeatureId: benchProducts.messagesInternalFeatureId,
		featureId: TestFeature.Messages,
		productId: PREFIXES.productId,
		name: "Bench Worker Remove",
	});
	const kept = await ensureBenchPlanItemProduct({
		db,
		orgId: org.id,
		env: ctx.env,
		internalFeatureId: words.internal_id,
		featureId: TestFeature.Words,
		productId: PREFIXES.productId,
		name: "Bench Worker Remove",
	});

	// Fixed so reset anchors (and so next_reset_at) match across runs and paths.
	const startsAt = SEED_STARTS_AT;
	await seedBenchPlanItems({
		db,
		count: args.customers,
		planInternalProductId: removed.internalProductId,
		planProductId: PREFIXES.productId,
		entitlementId: removed.entitlementId,
		internalFeatureId: benchProducts.messagesInternalFeatureId,
		featureId: TestFeature.Messages,
		startsAt,
		orgId: org.id,
		env: ctx.env,
		prefixes: PREFIXES,
	});
	await seedBenchPlanItems({
		db,
		count: args.customers,
		planInternalProductId: kept.internalProductId,
		planProductId: PREFIXES.productId,
		entitlementId: kept.entitlementId,
		internalFeatureId: words.internal_id,
		featureId: TestFeature.Words,
		startsAt,
		orgId: org.id,
		env: ctx.env,
		prefixes: { ...PREFIXES, entitlement: KEPT_ENTITLEMENT_PREFIX },
		balance: WORDS_SEED_BALANCE,
	});
	// The shared seeder predates billing_version; the worker's subject schema rejects NULL.
	await db.execute(sql`
		UPDATE customer_products SET billing_version = 'v1'
		WHERE internal_customer_id LIKE ${`${PREFIXES.internalCustomer}%`}
	`);
	await db.execute(sql`VACUUM (ANALYZE) customer_entitlements`);
	await db.execute(sql`VACUUM (ANALYZE) customer_products`);
	await db.execute(sql`VACUUM (ANALYZE) customers`);
	console.log(`bench: seeded ${args.customers} customers`);

	await startBalanceWorkerClient();
	const client = getBalanceWorkerClient();
	const customerIds = Array.from(
		{ length: args.customers },
		(_, index) => `${PREFIXES.customerId}${index + 1}`,
	);

	const warm = async () => {
		const started = Date.now();
		let failures = 0;
		await mapWithConcurrency({
			items: customerIds,
			concurrency: WARM_CONCURRENCY,
			run: async (customerId) => {
				const command = parseReadSubjectStateCommand({
					input: {
						...requestContextToCommandBase({ ctx, customerId }),
						type: "readSubjectState",
						org: orgToCommandOrg({ org: ctx.org }),
					},
				});
				await client.readSubjectState({ command }).catch(() => {
					failures += 1;
				});
			},
		});
		return { ms: Date.now() - started, failures };
	};
	if (!args.skipWarm) {
		const first = await warm();
		const second = await warm();
		console.log(
			`bench: warm pass 1 ${first.ms}ms (${first.failures} failed), pass 2 ${second.ms}ms (${second.failures} failed)`,
		);
	}

	// Separates warm-up subject loads from the migration in the worker's 10 s telemetry windows.
	if (!args.skipWarm) await Bun.sleep(11_000);

	const latencies: number[] = [];
	let callErrors = 0;
	const callsByCustomer = new Map<string, number>();
	const applyBillingPlan = client.applyBillingPlan.bind(client);
	client.applyBillingPlan = async (params) => {
		const customerId = params.request.command.identity.customerId;
		callsByCustomer.set(customerId, (callsByCustomer.get(customerId) ?? 0) + 1);
		const started = performance.now();
		try {
			return await applyBillingPlan(params);
		} catch (error) {
			callErrors += 1;
			throw error;
		} finally {
			latencies.push(performance.now() - started);
		}
	};

	const pageLogs: Array<{ at: number; data: Record<string, number> }> = [];
	const logger = ctx.logger;
	ctx.logger = new Proxy(logger, {
		get(target, property, receiver) {
			if (property !== "info") return Reflect.get(target, property, receiver);
			return (message: unknown, meta?: { data?: Record<string, number> }) => {
				if (message === "batch-migration: page executed")
					pageLogs.push({ at: Date.now(), data: meta?.data ?? {} });
				return target.info(message as string, meta);
			};
		},
	});

	const migrationId = "bench-mig-worker-remove";
	await db.execute(
		sql`DELETE FROM migrations WHERE org_id = ${org.id} AND env = ${ctx.env} AND id = ${migrationId}`,
	);
	const [migration] = (await db
		.insert(migrations)
		.values({
			internal_id: generateId("mig"),
			id: migrationId,
			org_id: org.id,
			env: ctx.env,
			filter: MigrationFilterSchema.parse({
				customer: { plan: { plan_id: PREFIXES.productId, custom: false } },
			}),
			operations: OperationsSchema.parse({
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: PREFIXES.productId, custom: false },
						customize: customizeFor({ ops: args.ops }),
					},
				],
			}),
			no_billing_changes: true,
			retry_failed: false,
			archived: false,
			created_at: Date.now(),
		})
		.returning()) as Migration[];

	const migrationRunId = generateId("bench_run");
	const preparedMigration = await prepareMigration({
		ctx,
		migration,
		dryRun: false,
	});
	const batchLane = await shouldRunBatchLane({
		ctx,
		migration: preparedMigration,
		migrationRunId,
		dryRun: false,
		controls: undefined,
		hasCustomHooks: false,
		hasCloudBatchAdapter: false,
	});
	if (!batchLane.shouldRun) throw new Error("bench: batch lane rejected");
	const executionPlan = batchMigrationPlanToExecutionPlan({
		plan: batchLane.plan,
	});

	const cpuBefore = {
		bench: process.cpuUsage(),
		worker: workerCpuSeconds(args.workerPid),
		postgres: cgroupCpuSeconds(args.pgCgroup),
		machine: machineCpuTicks(),
	};
	const runStarted = Date.now();
	let cursor: string | undefined;
	let processed = 0;
	let failed = 0;
	const phaseTotals: Record<string, number> = {};
	for (;;) {
		const result = await runBatchMigrationChunk({
			ctx,
			migration: preparedMigration,
			migrationRunId,
			plan: executionPlan,
			afterInternalId: cursor,
		});
		processed += result.processed;
		failed += result.summary.failed ?? 0;
		for (const [phase, ms] of Object.entries(result.summary.phases ?? {}))
			phaseTotals[phase] = (phaseTotals[phase] ?? 0) + ms;
		cursor = result.cursor ?? undefined;
		if (result.completion !== "slice_complete") break;
	}
	const wallMs = Date.now() - runStarted;
	const benchCpu = process.cpuUsage(cpuBefore.bench);
	const machineAfter = machineCpuTicks();
	const cpu = {
		machineBusyCores:
			(machineAfter.busy - cpuBefore.machine.busy) /
			CLOCK_TICKS_PER_SECOND /
			(wallMs / 1000),
		benchSeconds: (benchCpu.user + benchCpu.system) / 1e6,
		workerSeconds:
			cpuBefore.worker === null
				? null
				: (workerCpuSeconds(args.workerPid) ?? 0) - cpuBefore.worker,
		postgresSeconds:
			cpuBefore.postgres === null
				? null
				: (cgroupCpuSeconds(args.pgCgroup) ?? 0) - cpuBefore.postgres,
	};

	const pageMs = pageLogs.map(({ at }, index) =>
		index === 0 ? at - runStarted : at - pageLogs[index - 1].at,
	);
	const sortedLatencies = [...latencies].sort((a, b) => a - b);
	const retriedCustomers = [...callsByCustomer.values()].filter(
		(calls) => calls > 1,
	).length;

	const [state]: Array<Record<string, string>> = await db.execute(sql`
		SELECT
			(SELECT count(*) FROM customer_products WHERE internal_customer_id LIKE ${`${PREFIXES.internalCustomer}%`}) AS products,
			(SELECT count(*) FROM customer_entitlements WHERE id LIKE ${`${PREFIXES.entitlement}%`}) AS removed_left,
			(SELECT count(*) FROM customer_entitlements WHERE id LIKE ${`${KEPT_ENTITLEMENT_PREFIX}%`}) AS kept_left,
			(SELECT md5(string_agg(row_text, ',' ORDER BY row_text)) FROM (
				SELECT concat_ws(':', substring(ce.customer_product_id from '([0-9]+)$'), ce.feature_id, e.allowance, e.interval,
					ce.balance, ce.adjustment, ce.additional_balance, ce.unlimited, ce.usage_allowed,
					ce.reset_cycle_anchor, ce.next_reset_at, ce.internal_entity_id, coalesce(ce.expired, false), ce.invoice_credit) AS row_text
				FROM customer_entitlements ce JOIN entitlements e ON e.id = ce.entitlement_id
				WHERE ce.internal_customer_id LIKE ${`${PREFIXES.internalCustomer}%`}) AS state) AS entitlement_hash,
			(SELECT json_object_agg(feature_id || ':' || balance, n) FROM (
				SELECT ce.feature_id, ce.balance, count(*) AS n FROM customer_entitlements ce
				WHERE ce.internal_customer_id LIKE ${`${PREFIXES.internalCustomer}%`} GROUP BY 1, 2) AS shape) AS shape,
			(SELECT md5(string_agg(substring(id from '([0-9]+)$') || ':' || status || ':' || internal_product_id, ',' ORDER BY id))
			 FROM customer_products WHERE internal_customer_id LIKE ${`${PREFIXES.internalCustomer}%`}) AS product_hash
	`);
	const runStatuses: Array<{ status: string; count: string }> =
		await db.execute(sql`
			SELECT status, count(*) AS count FROM migration_item_runs
			WHERE migration_run_id = ${migrationRunId} GROUP BY status ORDER BY status
		`);

	const report = {
		path: args.path,
		customers: args.customers,
		concurrency:
			args.path === "sql" ? null : BATCH_MIGRATION_WORKER_SEND_CONCURRENCY,
		wallMs,
		customersPerSecond: Math.round(processed / (wallMs / 1000)),
		processed,
		failed,
		pageMs,
		pagePhases: pageLogs.map(({ data }) => data),
		phaseTotals,
		worker: {
			calls: latencies.length,
			callErrors,
			retriedCustomers,
			p50Ms: percentile(sortedLatencies, 50),
			p99Ms: percentile(sortedLatencies, 99),
			maxMs: sortedLatencies.at(-1) ?? null,
		},
		cpu,
		endState: state,
		runStatuses,
	};
	console.log(JSON.stringify(report, null, 2));
	if (args.out) writeFileSync(args.out, JSON.stringify(report, null, 2));
	process.exit(0);
};

await main();
