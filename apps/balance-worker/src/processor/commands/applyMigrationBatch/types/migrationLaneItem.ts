import type {
	ApplyBillingPlanCommand,
	ApplyBillingPlanRequest,
	MeteringIdentity,
} from "@autumn/balance-engine";

/** One customer's plan on the migration topic, with the item run it settles. */
export type MigrationLaneItem = {
	request: ApplyBillingPlanRequest;
	migrationInternalId: string;
	migrationRunId: string;
	internalCustomerId: string;
	producedAt: number;
	forceColdRollback?: boolean;
};

export type ClassifiedMigrationItem = {
	item: MigrationLaneItem;
	request: ApplyBillingPlanRequest;
	command: ApplyBillingPlanCommand;
	identity: MeteringIdentity;
	customerKey: string;
};

export type MigrationBatchOutcome = {
	size: number;
	alreadySettled: number;
	cold: number;
	resident: number;
	coldApplied: number;
	coldStale: number;
	coldSettled: number;
	coldFailed: number;
	coldFailure: string | null;
	residentApplied: number;
	residentStale: number;
	residentFailed: number;
	rowsDeleted: number;
	rowsUpdated: number;
	snapshotsDeleted: number;
	runsMarked: number;
	gateMs: number;
	classifyMs: number;
	coldSqlMs: number;
	laneDeleteMs: number;
	residentMs: number;
	residentRunsMs: number;
	evictLogMs: number;
	totalMs: number;
	oldestProducedAt: number;
	newestProducedAt: number;
	residentSubjects: number;
	droppedCapacity: number;
	fenceWaits: number;
};
