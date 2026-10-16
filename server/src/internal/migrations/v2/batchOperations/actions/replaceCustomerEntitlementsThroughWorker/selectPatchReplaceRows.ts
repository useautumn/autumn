import { isResettingEntitlement } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { iterateCustomerProductPages } from "@/internal/migrations/v2/batchOperations/execute/customerProductPagination/index.js";
import {
	BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
	BATCH_MIGRATION_FEATURE_OP_CONCURRENCY,
} from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";
import type {
	BatchMigrationExecutionPatch,
	BatchMigrationExecutionReplace,
} from "@/internal/migrations/v2/batchOperations/types/index.js";
import { enrichCustomerEntitlementCycles } from "@/internal/migrations/v2/batchOperations/utils/enrichCustomerEntitlementCycles.js";
import {
	type ReplaceCandidateRow,
	selectReplaceCandidateRows,
} from "../replaceCustomerEntitlementsForPage/selectReplaceCandidateRows.js";
import { groupFilterReplaceRows } from "../utils/groupFilterReplaceRows.js";
import type { ReplaceWorkerRow } from "./types/replaceWorkerRow.js";

export type PatchReplaceRows = {
	rows: ReplaceWorkerRow[];
	candidateCount: number;
	excludedInternalCustomerIds: string[];
};

const candidatesToReplaceRows = ({
	candidates,
	replace,
	now,
}: {
	candidates: ReplaceCandidateRow[];
	replace: BatchMigrationExecutionReplace;
	now: number;
}): { rows: ReplaceWorkerRow[]; excludedInternalCustomerIds: string[] } => {
	const toEntitlement = replace.entitlement;
	const { rows, excludedInternalCustomerIds } = isResettingEntitlement({
		entitlement: toEntitlement,
	})
		? enrichCustomerEntitlementCycles({
				candidates,
				entitlement: toEntitlement,
				now,
			})
		: {
				rows: candidates.map((candidate) => ({
					...candidate,
					resetCycleAnchor: null,
					nextResetAt: null,
				})),
				excludedInternalCustomerIds: [],
			};
	return {
		rows: groupFilterReplaceRows({ rows, toEntitlement }).flatMap(
			({ patch, rows: groupRows }) =>
				groupRows.map((row) => ({
					...row,
					replace,
					customerEntitlementPatch: patch,
				})),
		),
		excludedInternalCustomerIds,
	};
};

const selectReplaceRowsForOp = async ({
	ctx,
	patch,
	replace,
	internalCustomerIds,
	now,
}: {
	ctx: AutumnContext;
	patch: BatchMigrationExecutionPatch;
	replace: BatchMigrationExecutionReplace;
	internalCustomerIds: string[];
	now: number;
}): Promise<PatchReplaceRows> => {
	const toEntitlement = replace.entitlement;
	const candidates: ReplaceCandidateRow[] = [];
	const { rowCount } = await iterateCustomerProductPages({
		db: ctx.db,
		pageSize: BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
		executePage: async ({
			transaction,
			afterCustomerProductId,
			limit,
			assertWithinCeiling,
		}) => {
			const page = await selectReplaceCandidateRows({
				db: transaction,
				internalCustomerIds,
				scope: patch.scope,
				entitlement: toEntitlement,
				filter: replace.from,
				excludeEntitlementId: toEntitlement.id,
				features: ctx.features,
				includeAnchorSources: isResettingEntitlement({
					entitlement: toEntitlement,
				}),
				afterCustomerProductId,
				limit,
			});
			assertWithinCeiling(page.length);
			return { rows: page, result: page };
		},
		onCommit: (page) => {
			candidates.push(...page);
		},
	});
	return {
		...candidatesToReplaceRows({ candidates, replace, now }),
		candidateCount: rowCount,
	};
};

export const selectPatchReplaceRows = async ({
	ctx,
	patch,
	internalCustomerIds,
	now,
}: {
	ctx: AutumnContext;
	patch: BatchMigrationExecutionPatch;
	internalCustomerIds: string[];
	now: number;
}): Promise<PatchReplaceRows> => {
	if (internalCustomerIds.length === 0)
		return { rows: [], candidateCount: 0, excludedInternalCustomerIds: [] };
	const perOp = await mapWithConcurrency({
		items: patch.replaceEntitlementOps,
		concurrency: BATCH_MIGRATION_FEATURE_OP_CONCURRENCY,
		run: (replace) =>
			selectReplaceRowsForOp({
				ctx,
				patch,
				replace,
				internalCustomerIds,
				now,
			}),
	});
	return {
		rows: perOp.flatMap(({ rows }) => rows),
		candidateCount: perOp.reduce(
			(total, { candidateCount }) => total + candidateCount,
			0,
		),
		excludedInternalCustomerIds: [
			...new Set(
				perOp.flatMap(
					({ excludedInternalCustomerIds }) => excludedInternalCustomerIds,
				),
			),
		],
	};
};
