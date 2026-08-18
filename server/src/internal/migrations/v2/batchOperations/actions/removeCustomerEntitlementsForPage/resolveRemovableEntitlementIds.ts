import {
	type Entitlement,
	type EntitlementWithFeature,
	entitlements,
	entsAreSame,
	type Feature,
} from "@autumn/shared";
import { enrichEntitlementsWithFeatures } from "@autumn/shared/utils/productUtils/entUtils/enrichEntitlement.js";
import { inArray, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { BATCH_MIGRATION_MAX_DISTINCT_ENTITLEMENTS } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import {
	type OperationScope,
	operationScopeSql,
} from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";

/**
 * The definitions this page's customers actually hold for the target feature.
 *
 * A customer_entitlement can point at a custom or older-version definition the
 * catalog no longer exposes (composeFullProductQuery filters is_custom), so
 * resolving by catalog id alone would leave those customers holding the item.
 * Discovery is by feature; `entsAreSame` then keeps only the ones that mean
 * what the removed item meant.
 */
export const resolveRemovableEntitlementIds = async ({
	db,
	features,
	internalCustomerIds,
	scope,
	entitlement,
	maxDistinctEntitlements = BATCH_MIGRATION_MAX_DISTINCT_ENTITLEMENTS,
}: {
	db: DrizzleCli;
	features: Feature[];
	internalCustomerIds: string[];
	scope: OperationScope;
	entitlement: EntitlementWithFeature;
	maxDistinctEntitlements?: number;
}): Promise<string[]> => {
	if (internalCustomerIds.length === 0) return [];

	const liveIds = await selectDistinctLiveEntitlementIds({
		db,
		internalCustomerIds,
		scope,
		internalFeatureId: entitlement.internal_feature_id,
		limit: maxDistinctEntitlements + 1,
	});

	if (liveIds.length > maxDistinctEntitlements) {
		throw new Error(
			`batch-migration: page exceeded ${maxDistinctEntitlements} distinct entitlement definitions — aborting run`,
		);
	}

	const idsToLoad = liveIds.filter((id) => id !== entitlement.id);
	if (idsToLoad.length === 0) return [entitlement.id];

	const rows = await db
		.select()
		.from(entitlements)
		.where(inArray(entitlements.id, idsToLoad));
	const enriched = enrichEntitlementsWithFeatures({
		entitlements: rows as Entitlement[],
		features,
	});

	return [
		entitlement.id,
		...enriched
			.filter((candidate) => entsAreSame(candidate, entitlement))
			.map((candidate) => candidate.id),
	];
};

const selectDistinctLiveEntitlementIds = async ({
	db,
	internalCustomerIds,
	scope,
	internalFeatureId,
	limit,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	internalFeatureId: string;
	limit: number;
}): Promise<string[]> => {
	const rows = await db.execute<{ id: string }>(sql`
		SELECT DISTINCT live.entitlement_id AS id
		FROM customer_products AS cp
		INNER JOIN customer_entitlements AS live
			ON live.customer_product_id = cp.id
			AND live.internal_feature_id = ${internalFeatureId}
		WHERE cp.internal_customer_id = ANY(${sql.param(internalCustomerIds)}::text[])
			AND ${operationScopeSql({ scope })}
		LIMIT ${limit}
	`);
	return rows.map((row) => row.id);
};
