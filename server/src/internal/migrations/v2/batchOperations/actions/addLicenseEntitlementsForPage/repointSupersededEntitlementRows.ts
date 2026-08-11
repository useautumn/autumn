import { MIGRATABLE_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import {
	type OperationScope,
	operationScopeSql,
} from "../../scope/operationScope.js";
import type { CustomerEntitlementInitialState } from "../../types/index.js";

/**
 * Repoints assignments from the entitlement they hold onto the minted one,
 * crediting the allowance delta so consumption survives. The delta is read from
 * the two definitions rather than passed in, so a partly used balance moves by
 * the same amount the allowance did.
 *
 * The pool is resolved through the same canonical LATERAL the candidate select
 * uses: link_id is not unique, so an assignment can reach more than one pool and
 * the scope must apply to the parent that actually bills it.
 */
export const repointSupersededEntitlementRows = async ({
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

	// A balance only moves by the allowance delta while both definitions track
	// one. When tracking flips — metered to unlimited or back — the incoming
	// starting balance replaces it, matching computeCustomerEntitlementPatch.
	const balanceSql = initialState.tracksBalance
		? sql`target.balance
				+ COALESCE((SELECT allowance FROM entitlements WHERE id = ${toEntitlementId}), 0)
				- COALESCE((SELECT allowance FROM entitlements WHERE id = ${fromEntitlementId}), 0)`
		: sql`${initialState.granted}`;

	const repointed = await db.execute<{
		id: string;
		internal_customer_id: string;
	}>(sql`
		UPDATE customer_entitlements AS target
		SET
			entitlement_id = ${toEntitlementId},
			balance = ${balanceSql},
			unlimited = ${initialState.unlimited}
		FROM customer_products AS assignment
			JOIN LATERAL (
				SELECT pool.parent_customer_product_id
				FROM customer_licenses AS pool
				JOIN customer_products AS pool_parent
					ON pool_parent.id = pool.parent_customer_product_id
				WHERE pool.link_id = assignment.customer_license_link_id
					AND pool.license_internal_product_id = ${licenseInternalProductId}
				ORDER BY (pool_parent.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})) DESC,
					pool.created_at DESC, pool.id DESC
				LIMIT 1
			) AS pool ON true
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
		rows: repointed.length,
		internalCustomerIds: [
			...new Set(repointed.map((row) => row.internal_customer_id)),
		],
	};
};
