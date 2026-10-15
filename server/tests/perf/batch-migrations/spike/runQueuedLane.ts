import {
	meteringIdentityToPartitionKey,
	parseApplyBillingPlanRequest,
} from "@autumn/balance-engine";
import { meteringIdentityToPartition } from "@autumn/kafka/partitioning";
import { sql } from "drizzle-orm";
import { CompressionTypes, type Producer } from "kafkajs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { requestContextToCommandBase } from "@/internal/balances/balanceWorker/requestContextToCommandBase.js";
import type { WorkerMigrationPlan } from "@/internal/balanceWorker/migrationPlan/types/workerMigrationPlan.js";
import { removeCandidatesToMigrationPlan } from "@/internal/migrations/v2/batchOperations/actions/removeCustomerEntitlementsThroughWorker/removeCandidatesToMigrationPlan.js";
import { selectPatchRemoveCandidates } from "@/internal/migrations/v2/batchOperations/actions/removeCustomerEntitlementsThroughWorker/selectPatchRemoveCandidates.js";
import { replaceRowsToMigrationPlan } from "@/internal/migrations/v2/batchOperations/actions/replaceCustomerEntitlementsThroughWorker/replaceRowsToMigrationPlan.js";
import { selectPatchReplaceRows } from "@/internal/migrations/v2/batchOperations/actions/replaceCustomerEntitlementsThroughWorker/selectPatchReplaceRows.js";
import { isHeldByWorker } from "@/internal/migrations/v2/batchOperations/actions/throughWorker/isHeldByWorker.js";
import type { HeldRow } from "@/internal/migrations/v2/batchOperations/actions/throughWorker/types/heldRow.js";
import {
	claimNextBatchMigrationPage,
	markPageItemRuns,
} from "@/internal/migrations/v2/batchOperations/execute/claim/index.js";
import { splitPageByRouting } from "@/internal/migrations/v2/batchOperations/execute/routing/splitPageByRouting.js";
import type { RoutedPageCustomer } from "@/internal/migrations/v2/batchOperations/execute/routing/types/routedPageCustomer.js";
import type { BatchMigrationExecutionPlan } from "@/internal/migrations/v2/batchOperations/types/index.js";
import type { MigrationRuntimeWithEventId } from "@/internal/migrations/v2/types/migrationDefinition.js";
import { generateId } from "@/utils/genUtils.js";
import type { LaneScenario } from "./laneScenarios.js";

const MESSAGES_PER_SEND = 400;
const SENDS_IN_FLIGHT = 4;
const DRAIN_POLL_MS = 100;

export type LanePhaseTotals = {
	claim: number;
	candidates: number;
	plans: number;
	produce: number;
};

export type ProducedRecord = {
	key: Buffer;
	value: Buffer;
	partition: number;
};

export type QueuedLaneResult = {
	pages: number;
	produced: number;
	firstProduceAt: number;
	lastProduceAt: number;
	phases: LanePhaseTotals;
	skipped: number;
	records: Map<string, ProducedRecord>;
};

const rowsByCustomerOf = <Row extends { internalCustomerId: string }>({
	rows,
}: {
	rows: Row[];
}): Map<string, Row[]> => {
	const byCustomer = new Map<string, Row[]>();
	for (const row of rows) {
		const list = byCustomer.get(row.internalCustomerId) ?? [];
		list.push(row);
		byCustomer.set(row.internalCustomerId, list);
	}
	return byCustomer;
};

const plansForPage = async ({
	ctx,
	scenario,
	plan,
	customers,
}: {
	ctx: AutumnContext;
	scenario: LaneScenario;
	plan: BatchMigrationExecutionPlan;
	customers: RoutedPageCustomer[];
}): Promise<{
	plans: Map<string, WorkerMigrationPlan>;
	candidatesMs: number;
}> => {
	const internalCustomerIds = customers.map(({ internalId }) => internalId);
	const plans = new Map<string, WorkerMigrationPlan>();
	let candidatesMs = 0;
	for (const patch of plan.patches) {
		const startedAt = Date.now();
		if (scenario.name === "remove") {
			const rows = await selectPatchRemoveCandidates({
				ctx,
				patch,
				internalCustomerIds,
			});
			candidatesMs += Date.now() - startedAt;
			addPlans({
				plans,
				rows: rows.filter((row) => isHeldByWorker({ row })),
				toPlan: removeCandidatesToMigrationPlan,
			});
			continue;
		}
		const { rows } = await selectPatchReplaceRows({
			ctx,
			patch,
			internalCustomerIds,
			now: Date.now(),
		});
		candidatesMs += Date.now() - startedAt;
		addPlans({
			plans,
			rows: rows.filter((row) => isHeldByWorker({ row })),
			toPlan: replaceRowsToMigrationPlan,
		});
	}
	return { plans, candidatesMs };
};

const addPlans = <Row extends HeldRow>({
	plans,
	rows,
	toPlan,
}: {
	plans: Map<string, WorkerMigrationPlan>;
	rows: Row[];
	toPlan: ({ rows }: { rows: Row[] }) => WorkerMigrationPlan;
}): void => {
	for (const [internalCustomerId, customerRows] of rowsByCustomerOf({ rows })) {
		if (plans.has(internalCustomerId))
			throw new Error("Spike lane plans one phase per customer");
		plans.set(internalCustomerId, toPlan({ rows: customerRows }));
	}
};

export const laneRecordOf = ({
	ctx,
	customer,
	plan,
	migrationInternalId,
	migrationRunId,
	partitionCount,
	forceColdRollback,
}: {
	ctx: AutumnContext;
	customer: RoutedPageCustomer;
	plan: WorkerMigrationPlan;
	migrationInternalId: string;
	migrationRunId: string;
	partitionCount: number;
	forceColdRollback: boolean;
}): ProducedRecord => {
	const request = parseApplyBillingPlanRequest({
		input: {
			command: {
				...requestContextToCommandBase({ ctx, customerId: customer.id }),
				type: "applyBillingPlan",
				commandId: generateId("mig"),
				entityIds: plan.entityIds,
				ops: plan.ops,
			},
			catalogRows: plan.catalogRows,
		},
	});
	const { identity } = request.command;
	return {
		key: Buffer.from(meteringIdentityToPartitionKey({ identity })),
		value: Buffer.from(
			JSON.stringify({
				request,
				migrationInternalId,
				migrationRunId,
				internalCustomerId: customer.internalId,
				producedAt: Date.now(),
				...(forceColdRollback && { forceColdRollback }),
			}),
		),
		partition: meteringIdentityToPartition({ identity, partitionCount }),
	};
};

export const produceRecords = async ({
	producer,
	topic,
	records,
}: {
	producer: Producer;
	topic: string;
	records: readonly ProducedRecord[];
}): Promise<void> => {
	const sends: ProducedRecord[][] = [];
	for (let start = 0; start < records.length; start += MESSAGES_PER_SEND)
		sends.push(records.slice(start, start + MESSAGES_PER_SEND));
	let next = 0;
	await Promise.all(
		Array.from(
			{ length: Math.min(SENDS_IN_FLIGHT, sends.length) },
			async () => {
				while (next < sends.length) {
					const messages = sends[next];
					next += 1;
					if (!messages) continue;
					await producer.send({
						topic,
						messages,
						acks: -1,
						compression: CompressionTypes.GZIP,
					});
				}
			},
		),
	);
};

export const runQueuedLane = async ({
	ctx,
	scenario,
	migration,
	migrationInternalId,
	migrationRunId,
	plan,
	producer,
	topic,
	partitionCount,
	pageSize,
	rollbackPartition,
	onPageClaimed,
}: {
	ctx: AutumnContext;
	scenario: LaneScenario;
	migration: MigrationRuntimeWithEventId;
	migrationInternalId: string;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
	producer: Producer;
	topic: string;
	partitionCount: number;
	pageSize: number;
	rollbackPartition: number | null;
	onPageClaimed?: (params: { customers: RoutedPageCustomer[] }) => void;
}): Promise<QueuedLaneResult> => {
	const phases: LanePhaseTotals = {
		claim: 0,
		candidates: 0,
		plans: 0,
		produce: 0,
	};
	const records = new Map<string, ProducedRecord>();
	let cursor: string | undefined;
	let pages = 0;
	let produced = 0;
	let skipped = 0;
	let firstProduceAt = 0;
	let lastProduceAt = 0;
	for (;;) {
		const claimStartedAt = Date.now();
		const page = await claimNextBatchMigrationPage({
			ctx,
			migration,
			migrationInternalId,
			migrationRunId,
			afterInternalId: cursor,
			limit: pageSize,
		});
		phases.claim += Date.now() - claimStartedAt;
		if (page.selectedCount === 0) break;
		cursor = page.cursor ?? cursor;
		if (page.customers.length === 0) continue;
		pages += 1;
		const { worker: routed, sql: unrouted } = splitPageByRouting({
			ctx,
			customers: page.customers,
		});
		if (unrouted.length > 0)
			throw new Error("Spike lane runs with every customer routed");
		onPageClaimed?.({ customers: routed });
		const { plans, candidatesMs } = await plansForPage({
			ctx,
			scenario,
			plan,
			customers: routed,
		});
		phases.candidates += candidatesMs;
		const plansStartedAt = Date.now();
		const pageRecords: ProducedRecord[] = [];
		const withoutRows: string[] = [];
		for (const customer of routed) {
			const customerPlan = plans.get(customer.internalId);
			if (!customerPlan) {
				withoutRows.push(customer.internalId);
				continue;
			}
			const partition = meteringIdentityToPartition({
				identity: {
					orgId: ctx.org.id,
					env: ctx.env,
					customerId: customer.id,
					entityId: null,
				},
				partitionCount,
			});
			const record = laneRecordOf({
				ctx,
				customer,
				plan: customerPlan,
				migrationInternalId,
				migrationRunId,
				partitionCount,
				forceColdRollback: pages === 1 && partition === rollbackPartition,
			});
			records.set(customer.internalId, record);
			pageRecords.push(record);
		}
		phases.plans += Date.now() - plansStartedAt;
		if (withoutRows.length > 0) {
			skipped += withoutRows.length;
			await markPageItemRuns({
				db: ctx.db,
				migrationInternalId,
				migrationRunId,
				succeededInternalCustomerIds: [],
				noUpdatesNeededInternalCustomerIds: withoutRows,
				ineligibleInternalCustomerIds: [],
			});
		}
		const produceStartedAt = Date.now();
		if (firstProduceAt === 0) firstProduceAt = produceStartedAt;
		await produceRecords({ producer, topic, records: pageRecords });
		lastProduceAt = Date.now();
		phases.produce += lastProduceAt - produceStartedAt;
		produced += pageRecords.length;
	}
	return {
		pages,
		produced,
		firstProduceAt,
		lastProduceAt,
		phases,
		skipped,
		records,
	};
};

export type ItemRunCounts = {
	running: number;
	succeeded: number;
	skipped: number;
	failed: number;
	lastUpdatedAt: number;
	detectedAt: number;
};

export const readItemRunCounts = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
}): Promise<ItemRunCounts> => {
	const [row]: Array<Record<string, string | null>> = await ctx.db.execute(sql`
		SELECT
			count(*) FILTER (WHERE status = 'running') AS running,
			count(*) FILTER (WHERE status = 'succeeded') AS succeeded,
			count(*) FILTER (WHERE status = 'skipped') AS skipped,
			count(*) FILTER (WHERE status = 'failed') AS failed,
			max(updated_at) AS last_updated_at
		FROM migration_item_runs
		WHERE migration_internal_id = ${migrationInternalId}
			AND migration_run_id = ${migrationRunId}
			AND item_kind = 'customer' AND dry_run = false
	`);
	return {
		running: Number(row?.running ?? 0),
		succeeded: Number(row?.succeeded ?? 0),
		skipped: Number(row?.skipped ?? 0),
		failed: Number(row?.failed ?? 0),
		lastUpdatedAt: Number(row?.last_updated_at ?? 0),
		detectedAt: Date.now(),
	};
};

export const waitForLaneDrain = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	expectedRunning,
	stableForMs,
	timeoutMs,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	expectedRunning: number;
	stableForMs: number;
	timeoutMs: number;
}): Promise<ItemRunCounts> => {
	const giveUpAt = Date.now() + timeoutMs;
	let stableSince = 0;
	let last = await readItemRunCounts({
		ctx,
		migrationInternalId,
		migrationRunId,
	});
	for (;;) {
		if (last.running <= expectedRunning) {
			stableSince ||= Date.now();
			if (Date.now() - stableSince >= stableForMs) return last;
		} else stableSince = 0;
		if (Date.now() > giveUpAt) return last;
		await Bun.sleep(DRAIN_POLL_MS);
		last = await readItemRunCounts({
			ctx,
			migrationInternalId,
			migrationRunId,
		});
	}
};
