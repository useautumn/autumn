import type { EvictCommand } from "@autumn/balance-engine";
import { ColdMigrationBatchRolledBackError } from "@autumn/postgres";
import { logEvict } from "../../actions/logEvict.js";
import { SubjectStaleError } from "../../subject/subjectErrors.js";
import type { PartitionProcessorScope } from "../../types/partitionProcessor.js";
import {
	PartitionWriterDuplicateCommandError,
	PartitionWriterRecoveryRequiredError,
} from "../../writer/writerErrors.js";
import { applyBillingPlan } from "../applyBillingPlan/applyBillingPlan.js";
import {
	type ColdMigrationItem,
	classifyAndFenceMigrationBatch,
	parseMigrationLaneItems,
} from "./classifyAndFenceMigrationBatch.js";
import type {
	ClassifiedMigrationItem,
	MigrationBatchOutcome,
	MigrationLaneItem,
} from "./types/migrationLaneItem.js";

type ResidentVerdict = "applied" | "stale" | "failed";

type ColdOutcome = {
	applied: ColdMigrationItem[];
	stale: number;
	settled: number;
	failed: number;
	failure: string | null;
	rowsDeleted: number;
	rowsUpdated: number;
	snapshotsDeleted: number;
	runsMarked: number;
	sqlMs: number;
};

const itemRunOf = ({ item }: { item: MigrationLaneItem }) => ({
	migrationInternalId: item.migrationInternalId,
	migrationRunId: item.migrationRunId,
	internalCustomerId: item.internalCustomerId,
});

const applyColdItems = async ({
	scope,
	cold,
}: {
	scope: PartitionProcessorScope;
	cold: ColdMigrationItem[];
}): Promise<ColdOutcome> => {
	const empty: ColdOutcome = {
		applied: [],
		stale: 0,
		settled: 0,
		failed: 0,
		failure: null,
		rowsDeleted: 0,
		rowsUpdated: 0,
		snapshotsDeleted: 0,
		runsMarked: 0,
		sqlMs: 0,
	};
	if (cold.length === 0) return empty;
	const { topic, partition } = scope.ctx.config;
	const claimToken = scope.ctx.stateStore.readClaimToken?.({
		topic,
		partition,
	});
	const applyCold = scope.ctx.db.applyColdMigrationBatch;
	if (!claimToken || !applyCold)
		throw new Error("Cold migration needs a claimed Postgres store");
	for (const { request } of cold)
		scope.ctx.catalogCache.put({ rows: request.catalogRows });
	const startedAt = performance.now();
	try {
		const result = await applyCold({
			batch: {
				topic,
				partition,
				claimToken,
				forceRollback: cold.some(({ item }) => item.forceColdRollback),
				customers: cold.map(({ item, identity, ops }) => ({
					internalCustomerId: item.internalCustomerId,
					orgId: identity.orgId,
					env: identity.env,
					customerId: identity.customerId,
					migrationInternalId: item.migrationInternalId,
					migrationRunId: item.migrationRunId,
					ops,
				})),
			},
		});
		const applied = new Set(result.applied);
		return {
			applied: cold.filter(({ item }) => applied.has(item.internalCustomerId)),
			stale: result.stale.length,
			settled: result.settled.length,
			failed: 0,
			failure: null,
			rowsDeleted: result.deleted,
			rowsUpdated: result.updated,
			snapshotsDeleted: result.snapshotsDeleted,
			runsMarked: result.runsMarked,
			sqlMs: performance.now() - startedAt,
		};
	} catch (cause) {
		return {
			...empty,
			failed: cold.length,
			failure:
				cause instanceof ColdMigrationBatchRolledBackError
					? cause.message
					: cause instanceof Error
						? cause.message
						: String(cause),
			sqlMs: performance.now() - startedAt,
		};
	}
};

const applyResidentItem = async ({
	scope,
	classified,
}: {
	scope: PartitionProcessorScope;
	classified: ClassifiedMigrationItem;
}): Promise<ResidentVerdict> => {
	try {
		await applyBillingPlan({ scope, request: classified.request });
		return "applied";
	} catch (cause) {
		if (cause instanceof PartitionWriterRecoveryRequiredError) throw cause;
		if (cause instanceof PartitionWriterDuplicateCommandError) return "applied";
		if (cause instanceof SubjectStaleError) return "stale";
		scope.ctx.logger?.warn?.("Migration plan failed on the in-memory path", {
			customerId: classified.identity.customerId,
			error: cause,
		});
		return "failed";
	}
};

const logColdEvicts = async ({
	scope,
	applied,
}: {
	scope: PartitionProcessorScope;
	applied: ColdMigrationItem[];
}): Promise<void> => {
	const occurredAt = Date.now();
	await Promise.all(
		applied.map(({ identity, command }) => {
			const evict: EvictCommand = {
				schemaVersion: 1,
				type: "evict",
				requestId: command.requestId,
				identity: { ...identity, entityId: null },
				occurredAt,
			};
			return logEvict({ scope, command: evict, droppedState: null });
		}),
	);
};

/** Resident customers take the in-memory plan path; cold ones are written by one guarded statement and never become resident. */
export async function applyMigrationBatch({
	scope,
	items,
}: {
	scope: PartitionProcessorScope;
	items: readonly MigrationLaneItem[];
}): Promise<MigrationBatchOutcome> {
	const startedAt = performance.now();
	const parsed = parseMigrationLaneItems({ items });
	const classifyStartedAt = performance.now();
	const { cold, resident, release } = classifyAndFenceMigrationBatch({
		scope,
		items: parsed,
	});
	const classifyMs = performance.now() - classifyStartedAt;

	const coldRun = applyColdItems({ scope, cold }).finally(release);
	const residentStartedAt = performance.now();
	const residentRun = Promise.all(
		resident.map((classified) => applyResidentItem({ scope, classified })),
	).then((verdicts) => ({
		verdicts,
		ms: performance.now() - residentStartedAt,
	}));
	const [coldOutcome, residentOutcome] = await Promise.all([
		coldRun,
		residentRun,
	]);

	const residentApplied = resident.filter(
		(_, index) => residentOutcome.verdicts[index] === "applied",
	);
	const runsStartedAt = performance.now();
	await scope.ctx.db.markMigrationItemRunsSucceeded?.({
		runs: residentApplied.map(itemRunOf),
	});
	const residentRunsMs = performance.now() - runsStartedAt;

	const evictStartedAt = performance.now();
	await logColdEvicts({ scope, applied: coldOutcome.applied });
	const evictLogMs = performance.now() - evictStartedAt;

	const usage = scope.ctx.writer.readSubjectMapUsage();
	const producedAts = items.map(({ producedAt }) => producedAt);
	return {
		size: items.length,
		cold: cold.length,
		resident: resident.length,
		coldApplied: coldOutcome.applied.length,
		coldStale: coldOutcome.stale,
		coldSettled: coldOutcome.settled,
		coldFailed: coldOutcome.failed,
		coldFailure: coldOutcome.failure,
		residentApplied: residentApplied.length,
		residentStale: residentOutcome.verdicts.filter(
			(verdict) => verdict === "stale",
		).length,
		residentFailed: residentOutcome.verdicts.filter(
			(verdict) => verdict === "failed",
		).length,
		rowsDeleted: coldOutcome.rowsDeleted,
		rowsUpdated: coldOutcome.rowsUpdated,
		snapshotsDeleted: coldOutcome.snapshotsDeleted,
		runsMarked: coldOutcome.runsMarked,
		classifyMs,
		coldSqlMs: coldOutcome.sqlMs,
		residentMs: residentOutcome.ms,
		residentRunsMs,
		evictLogMs,
		totalMs: performance.now() - startedAt,
		oldestProducedAt: Math.min(...producedAts),
		newestProducedAt: Math.max(...producedAts),
		residentSubjects: usage.residentSubjects,
		droppedCapacity: usage.droppedSubjects.capacity,
	};
}
