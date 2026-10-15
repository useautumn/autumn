import type { EvictCommand, MeteringIdentity } from "@autumn/balance-engine";
import { writesSubjectSnapshots } from "@autumn/edge-config";
import {
	ColdMigrationBatchRolledBackError,
	itemRunKeyOf,
} from "@autumn/postgres";
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
	laneDeleteMs: number;
};

export class ColdMigrationRetryableError extends Error {
	constructor({ cause }: { cause: unknown }) {
		super("Cold migration batch failed; the batch is redelivered", { cause });
		this.name = "ColdMigrationRetryableError";
	}
}

const itemRunOf = ({ item }: { item: MigrationLaneItem }) => ({
	migrationInternalId: item.migrationInternalId,
	migrationRunId: item.migrationRunId,
	internalCustomerId: item.internalCustomerId,
});

const emptyColdOutcome = (): ColdOutcome => ({
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
	laneDeleteMs: 0,
});

const isForcedRollback = (cause: unknown): boolean =>
	cause instanceof ColdMigrationBatchRolledBackError &&
	cause.reason === "forced";

const deleteSnapshotsOnLane = async ({
	scope,
	applied,
}: {
	scope: PartitionProcessorScope;
	applied: ColdMigrationItem[];
}): Promise<void> => {
	const { snapshotQueues } = scope.ctx.stateStore;
	const settings = scope.ctx.subjectSnapshotsConfig?.get();
	if (!snapshotQueues || !settings || !writesSubjectSnapshots(settings)) return;
	const { topic, partition } = scope.ctx.config;
	for (const { customerKey } of applied)
		snapshotQueues.enqueueDelete({ topic, partition, customerKey });
	await Promise.all(
		applied.map(({ customerKey }) =>
			snapshotQueues.deleteLanded({ topic, partition, customerKey }),
		),
	);
};

const applyColdItems = async ({
	scope,
	cold,
}: {
	scope: PartitionProcessorScope;
	cold: ColdMigrationItem[];
}): Promise<ColdOutcome> => {
	if (cold.length === 0) return emptyColdOutcome();
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
	let result: Awaited<ReturnType<typeof applyCold>>;
	try {
		result = await applyCold({
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
	} catch (cause) {
		if (!isForcedRollback(cause))
			throw new ColdMigrationRetryableError({ cause });
		return {
			...emptyColdOutcome(),
			failed: cold.length,
			failure: cause instanceof Error ? cause.message : String(cause),
			sqlMs: performance.now() - startedAt,
		};
	}
	const sqlMs = performance.now() - startedAt;
	const appliedIds = new Set(result.applied);
	const applied = cold.filter(({ item }) =>
		appliedIds.has(item.internalCustomerId),
	);
	const laneStartedAt = performance.now();
	await deleteSnapshotsOnLane({ scope, applied });
	return {
		applied,
		stale: result.stale.length,
		settled: result.settled.length,
		failed: 0,
		failure: null,
		rowsDeleted: result.deleted,
		rowsUpdated: result.updated,
		snapshotsDeleted: result.snapshotsDeleted,
		runsMarked: result.runsMarked,
		sqlMs,
		laneDeleteMs: performance.now() - laneStartedAt,
	};
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

const logChangedCustomers = async ({
	scope,
	changed,
}: {
	scope: PartitionProcessorScope;
	changed: { identity: MeteringIdentity; requestId: string }[];
}): Promise<void> => {
	const occurredAt = Date.now();
	await Promise.all(
		changed.map(({ identity, requestId }) => {
			const evict: EvictCommand = {
				schemaVersion: 1,
				type: "evict",
				requestId,
				identity: { ...identity, entityId: null },
				occurredAt,
			};
			return logEvict({ scope, command: evict, droppedState: null });
		}),
	);
};

const firstOfEachItemRun = ({
	items,
}: {
	items: readonly ClassifiedMigrationItem[];
}): ClassifiedMigrationItem[] => {
	const seen = new Set<string>();
	return items.filter(({ item }) => {
		const key = itemRunKeyOf(itemRunOf({ item }));
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
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
	const parsed = firstOfEachItemRun({
		items: parseMigrationLaneItems({ items }),
	});
	const gateStartedAt = performance.now();
	const open = await scope.ctx.db.readOpenMigrationItemRuns?.({
		runs: parsed.map(({ item }) => itemRunOf({ item })),
	});
	const gateMs = performance.now() - gateStartedAt;
	const isOpen = ({ item }: ClassifiedMigrationItem) =>
		open?.has(itemRunKeyOf(itemRunOf({ item }))) ?? true;
	const pending = parsed.filter(isOpen);
	const alreadySettled = parsed.filter((classified) => !isOpen(classified));

	const classifyStartedAt = performance.now();
	const { cold, resident, release } = classifyAndFenceMigrationBatch({
		scope,
		items: pending,
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
	const [coldSettled, residentSettled] = await Promise.allSettled([
		coldRun,
		residentRun,
	]);
	if (residentSettled.status === "rejected") throw residentSettled.reason;
	const residentOutcome = residentSettled.value;

	const residentApplied = resident.filter(
		(_, index) => residentOutcome.verdicts[index] === "applied",
	);
	const runsStartedAt = performance.now();
	await scope.ctx.db.markMigrationItemRunsSucceeded?.({
		runs: residentApplied.map(itemRunOf),
	});
	const residentRunsMs = performance.now() - runsStartedAt;
	if (coldSettled.status === "rejected") throw coldSettled.reason;
	const coldOutcome = coldSettled.value;

	const evictStartedAt = performance.now();
	await logChangedCustomers({
		scope,
		changed: [...coldOutcome.applied, ...alreadySettled].map(
			({ identity, command }) => ({ identity, requestId: command.requestId }),
		),
	});
	const evictLogMs = performance.now() - evictStartedAt;

	const usage = scope.ctx.writer.readSubjectMapUsage();
	let oldestProducedAt = Number.POSITIVE_INFINITY;
	let newestProducedAt = 0;
	for (const { producedAt } of items) {
		oldestProducedAt = Math.min(oldestProducedAt, producedAt);
		newestProducedAt = Math.max(newestProducedAt, producedAt);
	}
	return {
		size: items.length,
		alreadySettled: alreadySettled.length,
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
		gateMs,
		classifyMs,
		coldSqlMs: coldOutcome.sqlMs,
		laneDeleteMs: coldOutcome.laneDeleteMs,
		residentMs: residentOutcome.ms,
		residentRunsMs,
		evictLogMs,
		totalMs: performance.now() - startedAt,
		oldestProducedAt,
		newestProducedAt,
		residentSubjects: usage.residentSubjects,
		droppedCapacity: usage.droppedSubjects.capacity,
	};
}
