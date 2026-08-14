import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import {
	type OperationScope,
	operationScopeSql,
} from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";

/** Matches by definition id so a custom or grandfathered row stays out of
 * reach, and re-asserts scope because the select took its own snapshot. */
export const deleteCustomerEntitlementRows = async ({
	db,
	customerProductIds,
	entitlementId,
	scope,
}: {
	db: DrizzleCli;
	customerProductIds: string[];
	entitlementId: string;
	scope: OperationScope;
}): Promise<string[]> => {
	if (customerProductIds.length === 0) return [];

	const deleted = await db.execute<{ customer_product_id: string }>(sql`
		WITH dropped AS (
			DELETE FROM customer_entitlements AS target
			USING customer_products AS cp
			WHERE cp.id = target.customer_product_id
				AND ${operationScopeSql({ scope })}
				AND target.customer_product_id IN (${sqlList({ values: customerProductIds })})
				AND target.entitlement_id = ${entitlementId}
				AND NOT target.is_pooled_balance
				AND target.pooled_contribution_id IS NULL
			RETURNING target.customer_product_id, target.entitlement_id
		), dropped_prices AS (
			DELETE FROM customer_prices AS price
			USING dropped, prices AS price_definition
			WHERE price.customer_product_id = dropped.customer_product_id
				AND price_definition.id = price.price_id
				AND price_definition.entitlement_id = dropped.entitlement_id
			RETURNING price.id
		)
		SELECT customer_product_id FROM dropped
	`);

	return deleted.map((row) => row.customer_product_id);
};
