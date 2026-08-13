import {
	type Entitlement,
	type EntitlementWithFeature,
	entitlements,
	type Feature,
	MIGRATABLE_STATUSES,
} from "@autumn/shared";
import { enrichEntitlementsWithFeatures } from "@autumn/shared/utils/productUtils/entUtils/enrichEntitlement.js";
import { inArray, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import { BATCH_MIGRATION_MAX_DISTINCT_ENTITLEMENTS } from "../../execute/utils/batchMigrationExecutionConstants.js";
import type { OperationScope } from "../../scope/operationScope.js";
import { operationScopeSql } from "../../scope/operationScope.js";
import { canonicalPoolLateralSql } from "../licenseEntitlementsForPage/licensePoolSql.js";

export type DistinctLicenseEntitlementsForPage = {
	distinct: EntitlementWithFeature[];
	fromEntitlement: EntitlementWithFeature;
};

/**
 * Distinct live entitlement definitions for one feature on this page's
 * assignments, plus the catalog from-entitlement (same fetch). Scoped to the
 * page's customers and the license product — never the whole run.
 */
export const listDistinctLicenseEntitlementsForPage = async ({
	db,
	features,
	internalCustomerIds,
	scope,
	licensePlanId,
	internalFeatureId,
	fromEntitlementId,
	maxDistinctEntitlements = BATCH_MIGRATION_MAX_DISTINCT_ENTITLEMENTS,
}: {
	db: DrizzleCli;
	features: Feature[];
	internalCustomerIds: string[];
	scope: OperationScope;
	licensePlanId: string;
	internalFeatureId: string;
	fromEntitlementId: string;
	maxDistinctEntitlements?: number;
}): Promise<DistinctLicenseEntitlementsForPage> => {
	const liveIds =
		internalCustomerIds.length === 0
			? []
			: await selectDistinctLiveEntitlementIds({
					db,
					internalCustomerIds,
					scope,
					licensePlanId,
					internalFeatureId,
					limit: maxDistinctEntitlements + 1,
				});

	if (liveIds.length > maxDistinctEntitlements) {
		throw new Error(
			`batch-migration: page exceeded ${maxDistinctEntitlements} distinct license entitlement definitions — aborting run`,
		);
	}

	const idsToLoad = [...new Set([...liveIds, fromEntitlementId])];
	const rows = await db
		.select()
		.from(entitlements)
		.where(inArray(entitlements.id, idsToLoad));
	const enriched = enrichEntitlementsWithFeatures({
		entitlements: rows as Entitlement[],
		features,
	});

	const fromEntitlement = enriched.find(
		(entitlement) => entitlement.id === fromEntitlementId,
	);
	if (!fromEntitlement) {
		throw new Error(
			`batch-migration: from entitlement ${fromEntitlementId} is missing`,
		);
	}

	const liveIdSet = new Set(liveIds);
	return {
		distinct: enriched.filter((entitlement) => liveIdSet.has(entitlement.id)),
		fromEntitlement,
	};
};

const selectDistinctLiveEntitlementIds = async ({
	db,
	internalCustomerIds,
	scope,
	licensePlanId,
	internalFeatureId,
	limit,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	licensePlanId: string;
	internalFeatureId: string;
	limit: number;
}): Promise<string[]> => {
	const idRows = await db.execute<{ id: string }>(sql`
		SELECT DISTINCT live.entitlement_id AS id
		FROM customer_products AS assignment
		${canonicalPoolLateralSql({ licensePlanId, columns: sql`pool.*` })}
		INNER JOIN customer_products AS cp
			ON cp.id = pool.parent_customer_product_id
		INNER JOIN customer_entitlements AS live
			ON live.customer_product_id = assignment.id
			AND live.internal_feature_id = ${internalFeatureId}
		WHERE assignment.internal_customer_id = ANY(${sql.param(internalCustomerIds)}::text[])
			AND assignment.internal_entity_id IS NOT NULL
			AND assignment.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})
			AND ${operationScopeSql({ scope })}
		LIMIT ${limit}
	`);
	return idRows.map((row) => row.id);
};
