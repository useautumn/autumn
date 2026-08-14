import {
	type CusProductStatus,
	EntInterval,
	type Entitlement,
	type Feature,
	MIGRATABLE_STATUSES,
	type PlanItemFilter,
} from "@autumn/shared";
import { enrichEntitlementsWithFeatures } from "@autumn/shared/utils/productUtils/entUtils/enrichEntitlement.js";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import type { BatchMigrationRemovedItem } from "../../execute/types/batchMigrationExecutionTypes.js";
import {
	type OperationScope,
	operationScopeSql,
} from "../../scope/operationScope.js";
import { canonicalPoolLateralSql } from "../licensePoolSql.js";

/** Pool anchors are excluded because the anchor FK is RESTRICT — deleting one
 * would abort the whole page. */
export const removeLicenseEntitlementRows = async ({
	db,
	internalCustomerIds,
	scope,
	filter,
	licensePlanId,
	features,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	filter: PlanItemFilter;
	licensePlanId: string;
	features: Feature[];
}): Promise<{
	rows: number;
	internalCustomerIds: string[];
	removedItems: BatchMigrationRemovedItem[];
}> => {
	if (internalCustomerIds.length === 0) {
		return { rows: 0, internalCustomerIds: [], removedItems: [] };
	}

	// The catalog has already dropped the item, so the removal names a filter
	// rather than an id and resolves against the rows it is deleting.
	const intervalCondition =
		filter.interval === undefined
			? sql``
			: sql`AND COALESCE(definition.interval, ${EntInterval.Lifetime}) = ${filter.interval}
				AND COALESCE(definition.interval_count, 1) = ${filter.interval_count ?? 1}`;

	const removed = await db.execute<{
		id: string;
		customer_product_id: string;
		feature_id: string;
		entitlement_id: string;
		internal_customer_id: string;
		entity_id: string | null;
		status: CusProductStatus;
		starts_at: string | null;
		canceled_at: string | null;
		ended_at: string | null;
		trial_ends_at: string | null;
		definition: Entitlement;
	}>(sql`
		WITH dropped AS (
			DELETE FROM customer_entitlements AS target
			USING entitlements AS definition,
				customer_products AS assignment
				${canonicalPoolLateralSql({ licensePlanId })}
				JOIN customer_products AS cp
					ON cp.id = pool.parent_customer_product_id
			WHERE assignment.id = target.customer_product_id
				AND definition.id = target.entitlement_id
				AND definition.feature_id = ${filter.feature_id}
				${intervalCondition}
				AND assignment.internal_customer_id = ANY(${sql.param(internalCustomerIds)}::text[])
				AND assignment.internal_entity_id IS NOT NULL
				AND assignment.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})
				AND NOT target.is_pooled_balance
				AND target.pooled_contribution_id IS NULL
				AND ${operationScopeSql({ scope })}
			RETURNING target.id, target.customer_product_id, target.entitlement_id,
				target.feature_id, assignment.internal_customer_id,
				assignment.internal_entity_id, assignment.status,
				assignment.starts_at, assignment.canceled_at, assignment.ended_at,
				assignment.trial_ends_at
		), dropped_prices AS (
			DELETE FROM customer_prices AS price
			USING dropped, prices AS price_definition
			WHERE price.customer_product_id = dropped.customer_product_id
				AND price_definition.id = price.price_id
				AND price_definition.entitlement_id = dropped.entitlement_id
			RETURNING price.id
		)
		SELECT dropped.id, dropped.customer_product_id, dropped.feature_id,
			dropped.entitlement_id, dropped.internal_customer_id, dropped.status,
			dropped.starts_at, dropped.canceled_at, dropped.ended_at,
			dropped.trial_ends_at, entity.id AS entity_id,
			TO_JSONB(definition) AS definition
		FROM dropped
		LEFT JOIN entities AS entity
			ON entity.internal_id = dropped.internal_entity_id
		INNER JOIN entitlements AS definition
			ON definition.id = dropped.entitlement_id
	`);

	const toMs = (value: string | null) =>
		value === null ? null : Number(value);

	return {
		rows: removed.length,
		internalCustomerIds: [
			...new Set(removed.map((row) => row.internal_customer_id)),
		],
		removedItems: removed.map((row) => ({
			internalCustomerId: row.internal_customer_id,
			customerProductId: row.customer_product_id,
			planId: licensePlanId,
			featureId: row.feature_id,
			entitlement: enrichEntitlementsWithFeatures({
				entitlements: [row.definition],
				features,
			})[0],
			entityId: row.entity_id,
			status: row.status,
			startsAt: toMs(row.starts_at),
			canceledAt: toMs(row.canceled_at),
			endedAt: toMs(row.ended_at),
			trialEndsAt: toMs(row.trial_ends_at),
		})),
	};
};
