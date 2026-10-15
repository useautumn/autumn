import { MigrationItemRunSkipReason } from "@autumn/shared";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { listScopedInternalCustomerIds } from "../actions/listScopedInternalCustomerIds/listScopedInternalCustomerIds.js";
import { createWorkerPageGate } from "../actions/throughWorker/createWorkerPageGate.js";
import type {
	BatchMigrationExecutionPatch,
	BatchMigrationExecutionPlan,
} from "../types/index.js";
import { markPageItemRuns } from "./claim/index.js";
import { runPatchAdds } from "./patchPhases/runPatchAdds.js";
import { runPatchLicenseOps } from "./patchPhases/runPatchLicenseOps.js";
import { runPatchRemoves } from "./patchPhases/runPatchRemoves.js";
import { runPatchReplaces } from "./patchPhases/runPatchReplaces.js";
import { runPatchRepoint } from "./patchPhases/runPatchRepoint.js";
import type {
	PatchPhaseArgs,
	PatchPhaseResult,
} from "./patchPhases/types/patchPhase.js";
import { evictSqlWrittenWorkerCustomers } from "./routing/evictSqlWrittenWorkerCustomers.js";
import { splitPageByRouting } from "./routing/splitPageByRouting.js";
import type {
	BatchMigrationInsertedItem,
	BatchMigrationPageCustomer,
	BatchMigrationPageResult,
	BatchMigrationRemovedItem,
	BatchMigrationRepointedProduct,
} from "./types/batchMigrationExecutionTypes.js";
import { BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS } from "./utils/batchMigrationExecutionConstants.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "./utils/pagePhaseTimings.js";

/**
 * Executes one claimed page: every patch's ops (scoped by the patch's
 * OperationScope), then the set-based status marks. Succeeded = customers a
 * patch actually changed (≥1 inserted row); everyone else — out-of-scope OR
 * already converged — is skipped.
 *
 * The unit of atomicity is one candidate BATCH, not the page: ops commit
 * per bounded batch (see runCandidateBatches) and the marks commit in their
 * own transaction. Safe because mutations are dedup-idempotent and the
 * page's claims stay `running` until the marks land — a mid-page failure
 * keeps committed batches and a replay converges the rest.
 */
export const executeBatchMigrationPage = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	plan,
	customers,
	phases,
	signal,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
	customers: BatchMigrationPageCustomer[];
	phases?: BatchMigrationPagePhases;
	signal: AbortSignal;
}): Promise<BatchMigrationPageResult> => {
	if (customers.length === 0)
		return {
			succeeded: [],
			skipped: [],
			failed: [],
			skipReasons: {},
			insertedItems: [],
			removedItems: [],
			repointedProducts: [],
			workerCurrentInternalIds: [],
		};

	const pageInternalIds = customers.map((customer) => customer.internalId);
	const now = Date.now();
	const { worker: workerCustomers } = splitPageByRouting({ ctx, customers });
	const workerIds = new Set(
		workerCustomers.map(({ internalId }) => internalId),
	);
	const workerGate = createWorkerPageGate({ signal });
	const insertedItems: BatchMigrationInsertedItem[] = [];
	const removedItems: BatchMigrationRemovedItem[] = [];
	const repointedProducts: BatchMigrationRepointedProduct[] = [];
	// Customers a patch cannot serve (e.g. no usable reset anchor) drop
	// from succeeded into skipped — the per-customer lane's territory.
	const excludedIds = new Set<string>();
	const changedIds = new Set<string>();
	const failReasons: Record<string, string> = {};
	const failedIds = new Set<string>();
	const sqlWrittenWorkerIds = new Set<string>();

	const merge = (result: PatchPhaseResult) => {
		insertedItems.push(...result.insertedItems);
		removedItems.push(...result.removedItems);
		repointedProducts.push(...result.repointedProducts);
		for (const id of result.changedInternalCustomerIds) changedIds.add(id);
		for (const id of result.excludedInternalCustomerIds) excludedIds.add(id);
		for (const [id, reason] of Object.entries(result.failureReasons)) {
			failedIds.add(id);
			failReasons[id] = reason;
		}
		for (const id of result.sqlWrittenWorkerCustomerIds)
			sqlWrittenWorkerIds.add(id);
	};
	const runPhase = async (phase: Promise<PatchPhaseResult>) => {
		const result = await phase;
		merge(result);
		await evictSqlWrittenWorkerCustomers({
			ctx,
			workerCustomers,
			sqlWrittenInternalCustomerIds: result.sqlWrittenWorkerCustomerIds,
		});
	};
	const phaseArgs = ({
		patch,
		leaveOut = new Set(),
	}: {
		patch: BatchMigrationExecutionPatch;
		leaveOut?: Set<string>;
	}): PatchPhaseArgs => ({
		ctx,
		migrationRunId,
		patch,
		now,
		phases,
		sqlInternalCustomerIds: pageInternalIds.filter(
			(id) => !workerIds.has(id) && !leaveOut.has(id),
		),
		workerCustomers: workerCustomers.filter(
			({ internalId }) =>
				!failedIds.has(internalId) && !leaveOut.has(internalId),
		),
		workerGate,
	});

	for (const patch of plan.patches) {
		// Removes run first: an add landing before its sibling remove would be
		// dropped again by a filter matching the same feature.
		await runPhase(runPatchRemoves(phaseArgs({ patch })));
		// Replaces run before adds so the add dedup sees post-replace definitions.
		await runPhase(runPatchReplaces(phaseArgs({ patch })));
		await runPhase(runPatchAdds(phaseArgs({ patch })));
		await runPhase(runPatchLicenseOps(phaseArgs({ patch })));
		await runPhase(
			runPatchRepoint(phaseArgs({ patch, leaveOut: excludedIds })),
		);
	}

	// A repointed pool or a dropped row is a real change even with nothing
	// inserted; leaving it out of `succeeded` would skip its cache invalidation.
	const succeeded = new Set([
		...insertedItems.map((item) => item.internalCustomerId),
		...removedItems.map((item) => item.internalCustomerId),
		...changedIds,
	]);
	for (const id of excludedIds) succeeded.delete(id);
	for (const id of failedIds) succeeded.delete(id);
	const skippedIds = pageInternalIds.filter(
		(id) => !succeeded.has(id) && !failedIds.has(id),
	);
	const skipReasons = await resolveSkipReasons({
		ctx,
		plan,
		skippedIds,
		excludedIds,
	});
	const noUpdatesNeededIds = skippedIds.filter(
		(id) => skipReasons[id] === MigrationItemRunSkipReason.NoUpdatesNeeded,
	);
	const ineligibleIds = skippedIds.filter(
		(id) => skipReasons[id] === MigrationItemRunSkipReason.Ineligible,
	);

	await timePhase({
		phases,
		phase: "marks",
		run: () =>
			withStatementTimeout(
				ctx.db,
				(transaction) =>
					markPageItemRuns({
						db: transaction,
						migrationInternalId,
						migrationRunId,
						succeededInternalCustomerIds: [...succeeded],
						noUpdatesNeededInternalCustomerIds: noUpdatesNeededIds,
						ineligibleInternalCustomerIds: ineligibleIds,
						failedInternalCustomerIds: [...failedIds],
					}),
				BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
				{ forceCustomPlan: true },
			),
	});

	return {
		succeeded: customers.filter((customer) =>
			succeeded.has(customer.internalId),
		),
		skipped: customers.filter(
			(customer) =>
				!succeeded.has(customer.internalId) &&
				!failedIds.has(customer.internalId),
		),
		failed: customers.filter((customer) => failedIds.has(customer.internalId)),
		failReasons,
		skipReasons,
		insertedItems,
		removedItems,
		repointedProducts,
		workerCurrentInternalIds: [...workerIds].filter(
			(id) => !sqlWrittenWorkerIds.has(id),
		),
	};
};

/** Skipped with a product in scope = already converged; otherwise ineligible. */
const resolveSkipReasons = async ({
	ctx,
	plan,
	skippedIds,
	excludedIds,
}: {
	ctx: AutumnContext;
	plan: BatchMigrationExecutionPlan;
	skippedIds: string[];
	excludedIds: Set<string>;
}): Promise<Record<string, MigrationItemRunSkipReason>> => {
	if (skippedIds.length === 0) return {};
	const scopedIds = await listScopedInternalCustomerIds({
		db: ctx.db,
		internalCustomerIds: skippedIds,
		scopes: plan.patches.map((patch) => patch.scope),
	});
	return Object.fromEntries(
		skippedIds.map((id) => [
			id,
			!excludedIds.has(id) && scopedIds.has(id)
				? MigrationItemRunSkipReason.NoUpdatesNeeded
				: MigrationItemRunSkipReason.Ineligible,
		]),
	);
};
