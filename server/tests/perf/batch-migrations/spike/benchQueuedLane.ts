import {
	balanceWorkerDeploymentToKafkaNames,
	getBalanceWorkerClientEnv,
	getBalanceWorkerDeployment,
} from "@autumn/env/balanceWorkerClient";
import { type Migration, migrations } from "@autumn/shared";
import { MigrationFilterSchema } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import { OperationsSchema } from "@autumn/shared/api/migrations/operations/operations.js";
import { TestFeature } from "@tests/setup/v2Features";
import { sql } from "drizzle-orm";
import { Kafka, Partitioners } from "kafkajs";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { batchMigrationPlanToExecutionPlan } from "@/internal/migrations/v2/batchOperations/compute/index.js";
import { runBatchMigrationChunk } from "@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js";
import { BATCH_MIGRATION_PAGE_SIZE } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import { prepareMigration } from "@/internal/migrations/v2/run/runMigration.js";
import { getMigrationEventInternalId } from "@/internal/migrations/v2/types/migrationDefinition.js";
import { shouldRunBatchLane } from "@/internal/migrations/v2/utils/shouldRunBatchLane.js";
import { generateId } from "@/utils/genUtils.js";
import { getBenchContext } from "../utils/benchContext.js";
import {
	type BenchPlanItemPrefixes,
	ensureBenchPlanItemProduct,
	seedBenchPlanItems,
} from "../utils/seedBenchPlanItems.js";
import {
	type LaneScenario,
	laneScenarioOf,
	UNRELATED_BALANCE,
	UNRELATED_PREFIXES,
} from "./laneScenarios.js";
import {
	produceRecords,
	readItemRunCounts,
	runQueuedLane,
	waitForLaneDrain,
} from "./runQueuedLane.js";
import {
	mapWithLimit,
	percentileOf,
	sendCheck,
	startSteadyTracks,
} from "./trackLoad.js";

const BASELINE_WORKER_PATH_PHASES = [
	"claim_select",
	"worker_candidates",
	"worker_unheld",
	"worker_remove",
	"worker_replace",
	"marks",
];
const WARM_CONCURRENCY = 64;

const parseArgs = () => {
	const args = process.argv.slice(2);
	const get = (flag: string) => {
		const index = args.indexOf(flag);
		return index === -1 ? undefined : args[index + 1];
	};
	return {
		scenario: laneScenarioOf({ name: get("--scenario") ?? "remove" }),
		customers: Number(get("--customers") ?? "1000"),
		residentPct: Number(get("--resident-pct") ?? "5"),
		mode: (get("--mode") ?? "spike") as "baseline" | "spike",
		pageSize: Number(get("--page-size") ?? String(BATCH_MIGRATION_PAGE_SIZE)),
		unrelated: Number(get("--unrelated") ?? "200"),
		unrelatedIntervalMs: Number(get("--unrelated-interval-ms") ?? "1000"),
		samplePerPage: Number(get("--sample-per-page") ?? "10"),
		sampleIntervalMs: Number(get("--sample-interval-ms") ?? "500"),
		rollbackPartition:
			get("--rollback-partition") === undefined
				? null
				: Number(get("--rollback-partition")),
		tracks: !args.includes("--no-tracks"),
		cleanup: args.includes("--cleanup"),
		keepRows: args.includes("--keep-rows"),
	};
};

const deleteSeededRows = async ({
	ctx,
	prefixes,
	withCustomers,
}: {
	ctx: AutumnContext;
	prefixes: BenchPlanItemPrefixes;
	withCustomers: boolean;
}) => {
	await ctx.db.execute(
		sql`DELETE FROM customer_entitlements WHERE id LIKE ${`${prefixes.entitlement}%`}`,
	);
	await ctx.db.execute(
		sql`DELETE FROM customer_products WHERE id LIKE ${`${prefixes.customerProduct}%`}`,
	);
	await ctx.db.execute(
		sql`DELETE FROM migration_item_runs WHERE item_id LIKE ${`${prefixes.internalCustomer}%`}`,
	);
	await ctx.db.execute(
		sql`DELETE FROM subject_snapshots WHERE customer_id LIKE ${`${prefixes.customerId}%`}`,
	);
	if (withCustomers)
		await ctx.db.execute(
			sql`DELETE FROM customers WHERE internal_id LIKE ${`${prefixes.internalCustomer}%`}`,
		);
};

const seedScenario = async ({
	ctx,
	orgId,
	messagesInternalFeatureId,
	prefixes,
	count,
	allowance,
	balance,
}: {
	ctx: AutumnContext;
	orgId: string;
	messagesInternalFeatureId: string;
	prefixes: BenchPlanItemPrefixes;
	count: number;
	allowance: number;
	balance: number;
}) => {
	const { internalProductId, entitlementId } = await ensureBenchPlanItemProduct(
		{
			db: ctx.db,
			orgId,
			env: ctx.env,
			internalFeatureId: messagesInternalFeatureId,
			featureId: TestFeature.Messages,
			productId: prefixes.productId,
			name: `Bench ${prefixes.productId}`,
			allowance,
		},
	);
	await seedBenchPlanItems({
		db: ctx.db,
		count,
		planInternalProductId: internalProductId,
		planProductId: prefixes.productId,
		entitlementId,
		internalFeatureId: messagesInternalFeatureId,
		featureId: TestFeature.Messages,
		startsAt: Date.now(),
		orgId,
		env: ctx.env,
		prefixes,
		balance,
	});
	return { entitlementId };
};

const createLaneMigration = async ({
	ctx,
	orgId,
	scenario,
}: {
	ctx: AutumnContext;
	orgId: string;
	scenario: LaneScenario;
}) => {
	await ctx.db.execute(
		sql`DELETE FROM migrations WHERE org_id = ${orgId} AND env = ${ctx.env} AND id = ${scenario.migrationId}`,
	);
	const [migration] = (await ctx.db
		.insert(migrations)
		.values({
			internal_id: generateId("mig"),
			id: scenario.migrationId,
			org_id: orgId,
			env: ctx.env,
			filter: MigrationFilterSchema.parse({
				customer: {
					plan: { plan_id: scenario.prefixes.productId, custom: false },
				},
			}),
			operations: OperationsSchema.parse({
				customer: [scenario.customerOperation],
			}),
			no_billing_changes: true,
			retry_failed: false,
			archived: false,
			created_at: Date.now(),
		})
		.returning()) as Migration[];
	if (!migration) throw new Error("Lane migration insert returned nothing");
	return migration;
};

const customerIdsOf = ({
	prefixes,
	indices,
}: {
	prefixes: BenchPlanItemPrefixes;
	indices: number[];
}) => indices.map((index) => `${prefixes.customerId}${index}`);

const warmIndicesOf = ({
	customers,
	residentPct,
}: {
	customers: number;
	residentPct: number;
}): number[] => {
	if (residentPct <= 0) return [];
	const step = Math.max(1, Math.round(100 / residentPct));
	const indices: number[] = [];
	for (let index = 1; index <= customers; index += step) indices.push(index);
	return indices;
};

const nextPageCustomerIds = async ({
	ctx,
	prefixes,
	afterInternalId,
	pageSize,
}: {
	ctx: AutumnContext;
	prefixes: BenchPlanItemPrefixes;
	afterInternalId: string | undefined;
	pageSize: number;
}): Promise<string[]> => {
	const rows: Array<{ id: string }> = await ctx.db.execute(sql`
		SELECT id FROM customers
		WHERE internal_id LIKE ${`${prefixes.internalCustomer}%`}
			AND internal_id COLLATE "C" > ${afterInternalId ?? ""} COLLATE "C"
		ORDER BY internal_id COLLATE "C"
		LIMIT ${pageSize}
	`);
	return rows.map((row) => row.id);
};

const verifyScenario = async ({
	ctx,
	scenario,
	customers,
	toEntitlementId,
	trackedApplied,
}: {
	ctx: AutumnContext;
	scenario: LaneScenario;
	customers: number;
	toEntitlementId: string | null;
	trackedApplied: Map<string, number>;
}) => {
	const { prefixes } = scenario;
	const tracked = JSON.stringify(
		[...trackedApplied].map(([customer_id, applied]) => ({
			customer_id,
			applied,
		})),
	);
	const expectedBase =
		scenario.startingBalance + scenario.toAllowance - scenario.fromAllowance;
	const [row]: Array<Record<string, string>> = await ctx.db.execute(sql`
		WITH tracked AS (
			SELECT * FROM jsonb_to_recordset(${tracked}::jsonb) AS t(customer_id text, applied int)
		)
		SELECT
			(SELECT count(*) FROM customer_products WHERE id LIKE ${`${prefixes.customerProduct}%`}) AS holders,
			(SELECT count(*) FROM customer_entitlements WHERE id LIKE ${`${prefixes.entitlement}%`}) AS rows,
			(SELECT count(*) FROM customer_entitlements WHERE id LIKE ${`${prefixes.entitlement}%`}
				AND entitlement_id = ${toEntitlementId ?? ""}) AS repointed,
			(SELECT count(*) FROM (
				SELECT customer_product_id FROM customer_entitlements
				WHERE customer_product_id LIKE ${`${prefixes.customerProduct}%`}
				GROUP BY customer_product_id HAVING count(*) > 1
			) AS d) AS duplicate_grants,
			(SELECT count(*) FROM customer_entitlements ce
				LEFT JOIN tracked t ON t.customer_id = ce.customer_id
				WHERE ce.id LIKE ${`${prefixes.entitlement}%`}
					AND ce.balance IS DISTINCT FROM (${expectedBase})::numeric - coalesce(t.applied, 0)) AS wrong_balance,
			(SELECT count(*) FROM customer_entitlements ce
				JOIN tracked t ON t.customer_id = ce.customer_id
				WHERE ce.id LIKE ${`${prefixes.entitlement}%`}
					AND ce.balance IS DISTINCT FROM (${expectedBase})::numeric - t.applied) AS tracked_wrong_balance,
			(SELECT count(*) FROM tracked) AS tracked_customers
	`);
	const counts = Object.fromEntries(
		Object.entries(row ?? {}).map(([key, value]) => [key, Number(value)]),
	);
	const correct =
		scenario.name === "remove"
			? counts.holders === customers &&
				counts.rows === 0 &&
				counts.duplicate_grants === 0
			: counts.holders === customers &&
				counts.rows === customers &&
				counts.repointed === customers &&
				counts.duplicate_grants === 0 &&
				counts.wrong_balance === 0;
	return { counts, correct };
};

const verifyUnrelated = async ({
	ctx,
	applied,
}: {
	ctx: AutumnContext;
	applied: Map<string, number>;
}) => {
	const tracked = JSON.stringify(
		[...applied].map(([customer_id, count]) => ({ customer_id, count })),
	);
	const [row]: Array<Record<string, string>> = await ctx.db.execute(sql`
		WITH tracked AS (
			SELECT * FROM jsonb_to_recordset(${tracked}::jsonb) AS t(customer_id text, count int)
		)
		SELECT count(*) AS wrong FROM customer_entitlements ce
		JOIN tracked t ON t.customer_id = ce.customer_id
		WHERE ce.id LIKE ${`${UNRELATED_PREFIXES.entitlement}%`}
			AND ce.balance IS DISTINCT FROM (${UNRELATED_BALANCE})::numeric - t.count
	`);
	return Number(row?.wrong ?? 0);
};

const verifyRolledBack = async ({
	ctx,
	scenario,
	internalCustomerIds,
	fromEntitlementId,
}: {
	ctx: AutumnContext;
	scenario: LaneScenario;
	internalCustomerIds: string[];
	fromEntitlementId: string;
}) => {
	const ids = JSON.stringify(internalCustomerIds);
	const [row]: Array<Record<string, string>> = await ctx.db.execute(sql`
		WITH ids AS (SELECT jsonb_array_elements_text(${ids}::jsonb) AS id)
		SELECT
			(SELECT count(*) FROM ids) AS customers,
			(SELECT count(*) FROM customer_entitlements ce WHERE ce.internal_customer_id IN (SELECT id FROM ids)
				AND ce.entitlement_id = ${fromEntitlementId}
				AND ce.balance = ${scenario.startingBalance}) AS untouched_rows,
			(SELECT count(*) FROM migration_item_runs r WHERE r.item_id IN (SELECT id FROM ids)
				AND r.status = 'running') AS still_running
	`);
	return Object.fromEntries(
		Object.entries(row ?? {}).map(([key, value]) => [key, Number(value)]),
	);
};

const main = async () => {
	const options = parseArgs();
	const { scenario, customers, mode } = options;
	process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
	const { ctx, org, benchProducts } = await getBenchContext({
		startBalanceWorker: !options.cleanup,
	});

	const cleanupStartedAt = Date.now();
	await deleteSeededRows({
		ctx,
		prefixes: scenario.prefixes,
		withCustomers: options.cleanup,
	});
	await deleteSeededRows({
		ctx,
		prefixes: UNRELATED_PREFIXES,
		withCustomers: options.cleanup,
	});
	console.log(`lane: cleanup ${Date.now() - cleanupStartedAt}ms`);
	if (options.cleanup) process.exit(0);

	const seedStartedAt = Date.now();
	const { entitlementId: fromEntitlementId } = await seedScenario({
		ctx,
		orgId: org.id,
		messagesInternalFeatureId: benchProducts.messagesInternalFeatureId,
		prefixes: scenario.prefixes,
		count: customers,
		allowance: scenario.fromAllowance,
		balance: scenario.startingBalance,
	});
	if (options.tracks)
		await seedScenario({
			ctx,
			orgId: org.id,
			messagesInternalFeatureId: benchProducts.messagesInternalFeatureId,
			prefixes: UNRELATED_PREFIXES,
			count: options.unrelated,
			allowance: UNRELATED_BALANCE,
			balance: UNRELATED_BALANCE,
		});
	await ctx.db.execute(sql`VACUUM (ANALYZE) customer_entitlements`);
	await ctx.db.execute(sql`VACUUM (ANALYZE) customer_products`);
	await ctx.db.execute(sql`VACUUM (ANALYZE) customers`);
	await ctx.db.execute(sql`VACUUM (ANALYZE) migration_item_runs`);
	console.log(
		`lane: seeded ${customers} ${scenario.name} customers in ${Date.now() - seedStartedAt}ms`,
	);

	const migration = await createLaneMigration({ ctx, orgId: org.id, scenario });
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
	if (!batchLane.shouldRun)
		throw new Error("Batch lane rejected the migration");
	const plan = batchMigrationPlanToExecutionPlan({ plan: batchLane.plan });
	const toEntitlementId =
		plan.patches.flatMap((patch) => patch.replaceEntitlementOps)[0]?.entitlement
			.id ?? null;
	const migrationInternalId = getMigrationEventInternalId(preparedMigration);

	const client = getBalanceWorkerClient();
	const warmIndices = warmIndicesOf({
		customers,
		residentPct: options.residentPct,
	});
	const warmIds = new Set(
		customerIdsOf({ prefixes: scenario.prefixes, indices: warmIndices }),
	);
	const warmStartedAt = Date.now();
	let warmFailures = 0;
	await mapWithLimit({
		items: [...warmIds],
		limit: WARM_CONCURRENCY,
		run: async (customerId) => {
			try {
				await sendCheck({ ctx, client, customerId });
			} catch {
				warmFailures += 1;
			}
		},
	});
	console.log(
		`lane: warmed ${warmIds.size} customers (${warmFailures} failed) in ${Date.now() - warmStartedAt}ms`,
	);

	const unrelatedIds = customerIdsOf({
		prefixes: UNRELATED_PREFIXES,
		indices: Array.from(
			{ length: options.tracks ? options.unrelated : 0 },
			(_, index) => index + 1,
		),
	});
	await mapWithLimit({
		items: unrelatedIds,
		limit: WARM_CONCURRENCY,
		run: (customerId) => sendCheck({ ctx, client, customerId }),
	});
	const unrelatedTracks = startSteadyTracks({
		ctx,
		client,
		intervalMs: options.unrelatedIntervalMs,
	});
	const sampleTracks = startSteadyTracks({
		ctx,
		client,
		intervalMs: options.sampleIntervalMs,
	});
	unrelatedTracks.add({ customerIds: unrelatedIds });
	await Bun.sleep(2_000);
	const unrelatedLatencyStart = unrelatedTracks.tally.latenciesMs.length;
	const samplesFrom = (ids: string[]) =>
		ids.filter((id) => !warmIds.has(id)).slice(0, options.samplePerPage);
	const tracksSample = options.tracks && scenario.tracksSampledCustomers;

	const windowStartedAt = Date.now();
	console.log(
		`lane: window start ${new Date(windowStartedAt).toISOString()} mode ${mode}`,
	);
	const result: Record<string, unknown> = {
		mode,
		scenario: scenario.name,
		customers,
		residentPct: options.residentPct,
		warmed: warmIds.size,
		pageSize: options.pageSize,
		windowStartedAt,
	};

	if (mode === "baseline") {
		let cursor: string | undefined;
		const phaseTotals: Record<string, number> = {};
		let processed = 0;
		let pages = 0;
		for (;;) {
			if (tracksSample) {
				const nextIds = await nextPageCustomerIds({
					ctx,
					prefixes: scenario.prefixes,
					afterInternalId: cursor,
					pageSize: options.pageSize,
				});
				sampleTracks.add({ customerIds: samplesFrom(nextIds) });
			}
			const chunk = await runBatchMigrationChunk({
				ctx,
				migration: preparedMigration,
				migrationRunId,
				plan,
				afterInternalId: cursor,
				maxPages: 1,
			});
			if (chunk.summary.pages > 0) {
				pages += 1;
				processed += chunk.processed;
				for (const [phase, ms] of Object.entries(chunk.summary.phases ?? {}))
					phaseTotals[phase] = (phaseTotals[phase] ?? 0) + ms;
			}
			cursor = chunk.cursor ?? undefined;
			if (chunk.completion !== "slice_complete") break;
		}
		const wallMs = Date.now() - windowStartedAt;
		const workerPathMs = BASELINE_WORKER_PATH_PHASES.reduce(
			(total, phase) => total + (phaseTotals[phase] ?? 0),
			0,
		);
		Object.assign(result, {
			pages,
			processed,
			wallMs,
			workerPathMs,
			phases: phaseTotals,
		});
	} else {
		const { KAFKA_BROKERS, BALANCE_WORKER_PARTITION_COUNT } =
			getBalanceWorkerClientEnv();
		const topic = balanceWorkerDeploymentToKafkaNames({
			deployment: getBalanceWorkerDeployment({ runtimeEnv: process.env }),
		}).migrationTopic;
		const kafka = new Kafka({
			clientId: "bench-migration-lane",
			brokers: KAFKA_BROKERS,
			logLevel: 1,
		});
		const producer = kafka.producer({
			createPartitioner: Partitioners.DefaultPartitioner,
			allowAutoTopicCreation: false,
		});
		await producer.connect();
		const lane = await runQueuedLane({
			ctx,
			scenario,
			migration: preparedMigration,
			migrationInternalId,
			migrationRunId,
			plan,
			producer,
			topic,
			partitionCount: BALANCE_WORKER_PARTITION_COUNT,
			pageSize: options.pageSize,
			rollbackPartition: options.rollbackPartition,
			onPageClaimed: ({ customers: pageCustomers }) => {
				if (tracksSample)
					sampleTracks.add({
						customerIds: samplesFrom(pageCustomers.map(({ id }) => id)),
					});
			},
		});
		const producedMs = Date.now() - windowStartedAt;
		const drained = await waitForLaneDrain({
			ctx,
			migrationInternalId,
			migrationRunId,
			expectedRunning: 0,
			stableForMs: options.rollbackPartition === null ? 0 : 5_000,
			timeoutMs: options.rollbackPartition === null ? 600_000 : 60_000,
		});
		const workerPathMs = drained.detectedAt - windowStartedAt;
		Object.assign(result, {
			pages: lane.pages,
			produced: lane.produced,
			producedMs,
			produceToDrainMs: drained.detectedAt - lane.firstProduceAt,
			lastCommitByDbClockMs: drained.lastUpdatedAt - windowStartedAt,
			workerPathMs,
			wallMs: Date.now() - windowStartedAt,
			phases: lane.phases,
			itemRuns: drained,
			topic,
		});
		if (options.rollbackPartition !== null && drained.running > 0) {
			const runningRows: Array<{ item_id: string }> = await ctx.db.execute(sql`
				SELECT item_id FROM migration_item_runs
				WHERE migration_internal_id = ${migrationInternalId} AND migration_run_id = ${migrationRunId}
					AND status = 'running'
			`);
			const rolledBack = runningRows.map((row) => row.item_id);
			const afterRollback = await verifyRolledBack({
				ctx,
				scenario,
				internalCustomerIds: rolledBack,
				fromEntitlementId,
			});
			const retryRecords = rolledBack.flatMap((internalId) => {
				const record = lane.records.get(internalId);
				if (!record) return [];
				const value = JSON.parse(record.value.toString());
				delete value.forceColdRollback;
				value.request.command.commandId = generateId("mig");
				value.producedAt = Date.now();
				return [{ ...record, value: Buffer.from(JSON.stringify(value)) }];
			});
			const retryStartedAt = Date.now();
			await produceRecords({ producer, topic, records: retryRecords });
			const retried = await waitForLaneDrain({
				ctx,
				migrationInternalId,
				migrationRunId,
				expectedRunning: 0,
				stableForMs: 0,
				timeoutMs: 120_000,
			});
			Object.assign(result, {
				rollback: {
					rolledBack: rolledBack.length,
					afterRollback,
					retried: retryRecords.length,
					retryMs: Date.now() - retryStartedAt,
					afterRetry: retried,
				},
			});
		}
		await producer.disconnect();
	}

	await Promise.all([sampleTracks.stop(), unrelatedTracks.stop()]);
	const unrelatedLatencies = unrelatedTracks.tally.latenciesMs.slice(
		unrelatedLatencyStart,
	);
	const scenarioCheck = await verifyScenario({
		ctx,
		scenario,
		customers,
		toEntitlementId,
		trackedApplied: sampleTracks.perCustomerApplied,
	});
	const unrelatedWrong = options.tracks
		? await verifyUnrelated({
				ctx,
				applied: unrelatedTracks.perCustomerApplied,
			})
		: 0;
	const itemRuns = await readItemRunCounts({
		ctx,
		migrationInternalId,
		migrationRunId,
	});
	Object.assign(result, {
		itemRunsFinal: itemRuns,
		verify: scenarioCheck.counts,
		unrelatedWrongBalance: unrelatedWrong,
		unrelatedTracks: {
			applied: unrelatedTracks.tally.applied,
			rejected: unrelatedTracks.tally.rejected,
			failed: unrelatedTracks.tally.failed,
			windowCount: unrelatedLatencies.length,
			p50: percentileOf({ values: unrelatedLatencies, percentile: 50 }),
			p99: percentileOf({ values: unrelatedLatencies, percentile: 99 }),
			max: percentileOf({ values: unrelatedLatencies, percentile: 100 }),
		},
		sampleTracks: {
			customers: sampleTracks.perCustomerApplied.size,
			applied: sampleTracks.tally.applied,
			rejected: sampleTracks.tally.rejected,
			failed: sampleTracks.tally.failed,
			p50: percentileOf({
				values: sampleTracks.tally.latenciesMs,
				percentile: 50,
			}),
			p99: percentileOf({
				values: sampleTracks.tally.latenciesMs,
				percentile: 99,
			}),
			firstP50: percentileOf({
				values: sampleTracks.tally.firstLatenciesMs,
				percentile: 50,
			}),
			firstP99: percentileOf({
				values: sampleTracks.tally.firstLatenciesMs,
				percentile: 99,
			}),
			firstMax: percentileOf({
				values: sampleTracks.tally.firstLatenciesMs,
				percentile: 100,
			}),
		},
	});
	const correct =
		scenarioCheck.correct &&
		unrelatedWrong === 0 &&
		itemRuns.running === 0 &&
		itemRuns.succeeded === customers &&
		sampleTracks.tally.failed === 0 &&
		unrelatedTracks.tally.failed === 0;
	Object.assign(result, { correct });
	console.log(`LANE_RESULT ${JSON.stringify(result)}`);
	console.log(correct ? "lane: CORRECT" : "lane: INCORRECT");
	if (!options.keepRows) {
		await deleteSeededRows({
			ctx,
			prefixes: scenario.prefixes,
			withCustomers: false,
		});
		await deleteSeededRows({
			ctx,
			prefixes: UNRELATED_PREFIXES,
			withCustomers: false,
		});
	}
	process.exit(correct ? 0 : 1);
};

await main();
