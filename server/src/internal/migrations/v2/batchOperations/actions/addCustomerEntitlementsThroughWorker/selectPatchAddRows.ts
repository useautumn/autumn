import { isResettingEntitlement } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { iterateCustomerProductPages } from "@/internal/migrations/v2/batchOperations/execute/customerProductPagination/index.js";
import {
	BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
	BATCH_MIGRATION_FEATURE_OP_CONCURRENCY,
} from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";
import type {
	BatchMigrationExecutionAdd,
	BatchMigrationExecutionPatch,
} from "@/internal/migrations/v2/batchOperations/types/index.js";
import { enrichCustomerEntitlementCycles } from "@/internal/migrations/v2/batchOperations/utils/enrichCustomerEntitlementCycles.js";
import { generateId } from "@/utils/genUtils.js";
import {
	AddCandidateRowSchema,
	buildAddCandidateRowsQuery,
	toAddCandidate,
} from "../addCustomerEntitlementsForPage/selectAddCandidateRows.js";
import { customerPriceIdsSql } from "../utils/customerPriceIdsSql.js";
import { productLoadedByWorkerSql } from "../utils/productLoadedByWorkerSql.js";
import type { AddWorkerRow } from "./types/addWorkerRow.js";

export type PatchAddRows = {
	rows: AddWorkerRow[];
	candidateCount: number;
	excludedInternalCustomerIds: string[];
};

const AddTargetRowSchema = AddCandidateRowSchema.extend({
	owner_internal_entity_id: z.string().nullable(),
	internal_product_id: z.string(),
	product_is_custom: z.boolean(),
	product_loaded_by_worker: z.boolean(),
	customer_price_ids: z.array(z.string()),
	feature_grants: z.record(z.string(), z.string()),
});

type AddTarget = ReturnType<typeof toAddCandidate> & {
	ownerInternalEntityId: string | null;
	internalProductId: string;
	productIsCustom: boolean;
	productLoadedByWorker: boolean;
	customerPriceIds: string[];
	featureGrants: Record<string, string>;
};

const selectAddTargets = async ({
	ctx,
	patch,
	add,
	internalCustomerIds,
}: {
	ctx: AutumnContext;
	patch: BatchMigrationExecutionPatch;
	add: BatchMigrationExecutionAdd;
	internalCustomerIds: string[];
}): Promise<{ targets: AddTarget[]; candidateCount: number }> => {
	const targets: AddTarget[] = [];
	const { rowCount } = await iterateCustomerProductPages({
		db: ctx.db,
		pageSize: BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
		executePage: async ({
			transaction,
			afterCustomerProductId,
			limit,
			assertWithinCeiling,
		}) => {
			const rows = await transaction.execute(
				buildAddCandidateRowsQuery({
					internalCustomerIds,
					scope: patch.scope,
					entitlement: add.entitlement,
					includeAnchorSources: isResettingEntitlement({
						entitlement: add.entitlement,
					}),
					afterCustomerProductId,
					limit,
					extraSelect: sql`,
						cp.internal_entity_id AS owner_internal_entity_id,
						cp.internal_product_id AS internal_product_id,
						cp.is_custom AS product_is_custom,
						${productLoadedByWorkerSql} AS product_loaded_by_worker,
						${customerPriceIdsSql} AS customer_price_ids,
						(
							SELECT COALESCE(
								JSONB_OBJECT_AGG(feature_grant.id, feature_grant.entitlement_id),
								'{}'::jsonb
							)
							FROM customer_entitlements AS feature_grant
							WHERE feature_grant.customer_product_id = cp.id
								AND feature_grant.internal_feature_id = ${add.entitlement.internal_feature_id}
						) AS feature_grants
					`,
				}),
			);
			const page = rows.map((row) => {
				const parsed = AddTargetRowSchema.parse(row);
				return {
					...toAddCandidate({ parsed }),
					ownerInternalEntityId: parsed.owner_internal_entity_id,
					internalProductId: parsed.internal_product_id,
					productIsCustom: parsed.product_is_custom,
					productLoadedByWorker: parsed.product_loaded_by_worker,
					customerPriceIds: parsed.customer_price_ids,
					featureGrants: parsed.feature_grants,
				};
			});
			assertWithinCeiling(page.length);
			return {
				rows: page.map(({ customerProductId }) => ({ customerProductId })),
				result: page,
			};
		},
		onCommit: (page) => {
			targets.push(...page);
		},
	});
	return { targets, candidateCount: rowCount };
};

const selectAddRowsForOp = async ({
	ctx,
	patch,
	add,
	internalCustomerIds,
	now,
}: {
	ctx: AutumnContext;
	patch: BatchMigrationExecutionPatch;
	add: BatchMigrationExecutionAdd;
	internalCustomerIds: string[];
	now: number;
}): Promise<PatchAddRows> => {
	const { targets, candidateCount } = await selectAddTargets({
		ctx,
		patch,
		add,
		internalCustomerIds,
	});
	const { rows, excludedInternalCustomerIds } = isResettingEntitlement({
		entitlement: add.entitlement,
	})
		? enrichCustomerEntitlementCycles({
				candidates: targets,
				entitlement: add.entitlement,
				now,
			})
		: {
				rows: targets.map((target) => ({
					...target,
					resetCycleAnchor: null,
					nextResetAt: null,
				})),
				excludedInternalCustomerIds: [],
			};
	return {
		rows: rows.map((row) => ({
			...row,
			id: generateId("cus_ent"),
			add,
			ownerEntityId: row.entityId,
		})),
		candidateCount,
		excludedInternalCustomerIds,
	};
};

export const selectPatchAddRows = async ({
	ctx,
	patch,
	internalCustomerIds,
	now,
}: {
	ctx: AutumnContext;
	patch: BatchMigrationExecutionPatch;
	internalCustomerIds: string[];
	now: number;
}): Promise<PatchAddRows> => {
	if (internalCustomerIds.length === 0)
		return { rows: [], candidateCount: 0, excludedInternalCustomerIds: [] };
	const perOp = await mapWithConcurrency({
		items: patch.addEntitlementOps,
		concurrency: BATCH_MIGRATION_FEATURE_OP_CONCURRENCY,
		run: (add) =>
			selectAddRowsForOp({ ctx, patch, add, internalCustomerIds, now }),
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
