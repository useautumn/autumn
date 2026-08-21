import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import { rowIsUnpaidSql } from "@/internal/migrations/v2/batchOperations/actions/utils/rowIsUnpaidSql.js";
import {
	type OperationScope,
	operationScopeSql,
} from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";

/** Re-asserts row-level pooled, rollover, paid, and operation scope after
 * candidate selection's snapshot. One DELETE for the whole page of row ids. */
export const deleteCustomerEntitlementRows = async ({
	db,
	customerEntitlementIds,
	scope,
}: {
	db: DrizzleCli;
	customerEntitlementIds: string[];
	scope: OperationScope;
}): Promise<string[]> => {
	if (customerEntitlementIds.length === 0) return [];

	const deleted = await db.execute<{ id: string }>(sql`
		WITH dropped AS (
			DELETE FROM customer_entitlements AS target
			USING customer_products AS cp, entitlements AS definition
			WHERE cp.id = target.customer_product_id
				AND definition.id = target.entitlement_id
				AND ${operationScopeSql({ scope })}
				AND target.id IN (${sqlList({ values: customerEntitlementIds })})
				AND definition.pooled IS NOT TRUE
				AND NOT target.is_pooled_balance
				AND target.pooled_contribution_id IS NULL
				AND NOT EXISTS (
					SELECT 1 FROM rollovers WHERE rollovers.cus_ent_id = target.id
				)
				AND ${rowIsUnpaidSql({
					customerProductId: sql`target.customer_product_id`,
					entitlementId: sql`target.entitlement_id`,
				})}
			RETURNING target.id
		)
		SELECT id FROM dropped
	`);

	return deleted.map((row) => row.id);
};
