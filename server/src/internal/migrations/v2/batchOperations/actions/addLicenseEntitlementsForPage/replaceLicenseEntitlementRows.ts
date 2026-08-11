import {
	AllowanceType,
	FeatureType,
	MIGRATABLE_STATUSES,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import {
	type OperationScope,
	operationScopeSql,
} from "../../scope/operationScope.js";
import type { CustomerEntitlementInitialState } from "../../types/index.js";
import { canonicalPoolLateralSql } from "./licensePoolSql.js";

/** Mirrors computeBalancePatch in SQL: compute never resolves the pre-edit
 * definition, so the from-side is read here. */
export const replaceLicenseEntitlementRows = async ({
	db,
	internalCustomerIds,
	scope,
	fromEntitlementId,
	toEntitlementId,
	licenseInternalProductId,
	initialState,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	fromEntitlementId: string;
	toEntitlementId: string;
	licenseInternalProductId: string;
	initialState: CustomerEntitlementInitialState;
}): Promise<{ rows: number; internalCustomerIds: string[] }> => {
	if (internalCustomerIds.length === 0) {
		return { rows: 0, internalCustomerIds: [] };
	}

	const fromTracksBalanceSql = sql`EXISTS (
		SELECT 1
		FROM entitlements AS from_definition
		INNER JOIN features AS from_feature
			ON from_feature.internal_id = from_definition.internal_feature_id
		WHERE from_definition.id = ${fromEntitlementId}
			AND from_feature.type IS DISTINCT FROM ${FeatureType.Boolean}
			AND from_definition.allowance_type IS DISTINCT FROM ${AllowanceType.Unlimited}
	)`;

	const balanceSql = initialState.tracksBalance
		? sql`CASE WHEN ${fromTracksBalanceSql}
				THEN target.balance
					+ COALESCE((SELECT allowance FROM entitlements WHERE id = ${toEntitlementId}), 0)
					- COALESCE((SELECT allowance FROM entitlements WHERE id = ${fromEntitlementId}), 0)
				ELSE ${initialState.granted}
			END`
		: sql`CASE WHEN ${fromTracksBalanceSql}
				THEN ${initialState.granted}
				ELSE target.balance
			END`;

	const unlimitedSql =
		initialState.unlimited === null
			? sql`target.unlimited`
			: sql`${initialState.unlimited}`;

	const replaced = await db.execute<{
		id: string;
		internal_customer_id: string;
	}>(sql`
		UPDATE customer_entitlements AS target
		SET
			entitlement_id = ${toEntitlementId},
			balance = ${balanceSql},
			unlimited = ${unlimitedSql}
		FROM customer_products AS assignment
			${canonicalPoolLateralSql({ licenseInternalProductId })}
			JOIN customer_products AS cp
				ON cp.id = pool.parent_customer_product_id
		WHERE assignment.id = target.customer_product_id
			AND target.entitlement_id = ${fromEntitlementId}
			AND assignment.internal_customer_id = ANY(${sql.param(internalCustomerIds)}::text[])
			AND assignment.internal_entity_id IS NOT NULL
			AND assignment.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})
			AND ${operationScopeSql({ scope })}
		RETURNING target.id, assignment.internal_customer_id
	`);

	return {
		rows: replaced.length,
		internalCustomerIds: [
			...new Set(replaced.map((row) => row.internal_customer_id)),
		],
	};
};
