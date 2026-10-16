import type { MigrationRecord } from "@autumn/balance-worker-client";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	claimNextBatchMigrationPage,
	markPageItemRuns,
} from "@/internal/migrations/v2/batchOperations/execute/claim/index.js";
import { splitPageByRouting } from "@/internal/migrations/v2/batchOperations/execute/routing/splitPageByRouting.js";
import { BATCH_MIGRATION_PAGE_SIZE } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import type { BatchMigrationExecutionPlan } from "@/internal/migrations/v2/batchOperations/types/index.js";
import {
	getMigrationEventInternalId,
	type MigrationRuntimeWithEventId,
} from "@/internal/migrations/v2/types/migrationDefinition.js";
import { appendLaneRecords } from "./appendLaneRecords.js";
import { laneRecordOf } from "./laneRecordOf.js";
import { plansForLanePage } from "./plansForLanePage.js";
import type {
	QueuedLaneChunkResult,
	QueuedLanePhases,
	QueuedLaneScenario,
} from "./types/queuedLane.js";

const PAGE_RESERVE_MS = 60_000;

export const runQueuedLaneChunk = async ({
	ctx,
	migration,
	migrationRunId,
	plan,
	scenario,
	afterInternalId,
	maxPages,
	deadlineAt,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
	scenario: QueuedLaneScenario;
	afterInternalId?: string;
	maxPages: number;
	deadlineAt?: number;
}): Promise<QueuedLaneChunkResult> => {
	const migrationInternalId = getMigrationEventInternalId(migration);
	const client = getBalanceWorkerClient();
	const phases: QueuedLanePhases = {
		claim: 0,
		candidates: 0,
		plans: 0,
		produce: 0,
	};
	let cursor = afterInternalId ?? null;
	let pages = 0;
	let produced = 0;
	let skipped = 0;
	let firstProduceAt = 0;
	let lastProduceAt = 0;
	const finish = (
		completion: QueuedLaneChunkResult["completion"],
	): QueuedLaneChunkResult => ({
		lane: "queued",
		processed: produced + skipped,
		completion,
		cursor,
		summary: { pages, succeeded: 0, skipped, failed: 0, phases },
		produced,
		phases,
		firstProduceAt,
		lastProduceAt,
	});
	const outOfTime = () =>
		deadlineAt !== undefined && Date.now() > deadlineAt - PAGE_RESERVE_MS;

	while (pages < maxPages && !outOfTime()) {
		const claimStartedAt = Date.now();
		const page = await claimNextBatchMigrationPage({
			ctx,
			migration,
			migrationInternalId,
			migrationRunId,
			afterInternalId: cursor ?? undefined,
			limit: BATCH_MIGRATION_PAGE_SIZE,
		});
		phases.claim += Date.now() - claimStartedAt;
		if (page.selectedCount === 0) return finish("exhausted");
		cursor = page.cursor ?? cursor;
		if (page.customers.length === 0) continue;
		pages += 1;

		const { worker: routed, sql: unrouted } = splitPageByRouting({
			ctx,
			customers: page.customers,
		});
		if (unrouted.length > 0)
			throw new Error("The queued lane runs only with every customer routed");
		const { plans, candidatesMs } = await plansForLanePage({
			ctx,
			scenario,
			plan,
			customers: routed,
		});
		phases.candidates += candidatesMs;

		const plansStartedAt = Date.now();
		const records: MigrationRecord[] = [];
		const withoutRows: string[] = [];
		for (const customer of routed) {
			const customerPlan = plans.get(customer.internalId);
			if (!customerPlan) {
				withoutRows.push(customer.internalId);
				continue;
			}
			records.push(
				laneRecordOf({
					ctx,
					customer,
					plan: customerPlan,
					migrationInternalId,
					migrationRunId,
				}),
			);
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
		firstProduceAt ||= produceStartedAt;
		await appendLaneRecords({ client, records });
		lastProduceAt = Date.now();
		phases.produce += lastProduceAt - produceStartedAt;
		produced += records.length;
	}
	return finish("slice_complete");
};
