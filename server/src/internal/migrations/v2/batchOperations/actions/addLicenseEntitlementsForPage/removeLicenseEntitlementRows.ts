import { MIGRATABLE_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import {
	type OperationScope,
	operationScopeSql,
} from "../../scope/operationScope.js";

/**
 * Drops the assignments' rows for a deleted license item, and the customer
 * prices paired to it — the per-customer lane deletes both together, and an
 * orphaned price would keep billing for an entitlement the customer no longer
 * holds. Rollovers, replaceables and pooled contributions cascade.
 *
 * Pool anchors and contributors are excluded: the anchor FK is RESTRICT, so
 * deleting one would abort the whole page, and a contributor's balance lives in
 * the pool rather than the row.
 *
 * The pool is resolved through the same canonical LATERAL the candidate select
 * uses: link_id is not unique, so an assignment can reach more than one pool and
 * the scope must apply to the parent that actually bills it.
 */
export const removeLicenseEntitlementRows = async ({
	db,
	internalCustomerIds,
	scope,
	fromEntitlementId,
	licenseInternalProductId,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	fromEntitlementId: string;
	licenseInternalProductId: string;
}): Promise<{ rows: number; internalCustomerIds: string[] }> => {
	if (internalCustomerIds.length === 0) {
		return { rows: 0, internalCustomerIds: [] };
	}

	const removed = await db.execute<{
		id: string;
		internal_customer_id: string;
	}>(sql`
		WITH dropped AS (
			DELETE FROM customer_entitlements AS target
			USING customer_products AS assignment
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
				AND NOT target.is_pooled_balance
				AND target.pooled_contribution_id IS NULL
				AND ${operationScopeSql({ scope })}
			RETURNING target.id, target.customer_product_id,
				assignment.internal_customer_id
		), dropped_prices AS (
			DELETE FROM customer_prices AS price
			USING dropped, prices AS definition
			WHERE price.customer_product_id = dropped.customer_product_id
				AND definition.id = price.price_id
				AND definition.entitlement_id = ${fromEntitlementId}
			RETURNING price.id
		)
		SELECT id, internal_customer_id FROM dropped
	`);

	return {
		rows: removed.length,
		internalCustomerIds: [
			...new Set(removed.map((row) => row.internal_customer_id)),
		],
	};
};
