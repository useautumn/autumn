import { type SQL, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { RemoveEntitlementPriceOperation } from "../../types/entitlementPriceOperationTypes";
import type { BatchMutationResult } from "../../types/types";
import { activeStatusesSql, sqlList } from "./batchTransitionSqlUtils";
export const buildDeleteCustomerEntitlementsBatchQuery = ({
	customerLicenseLinkId,
	operation,
	batchSize,
	now,
}: {
	customerLicenseLinkId: string;
	operation: RemoveEntitlementPriceOperation;
	batchSize: number;
	now: number;
}): SQL => sql`
		WITH candidate_rows AS MATERIALIZED (
			SELECT
				customer_entitlement.ctid AS target_ctid,
				contribution.pooled_balance_id
			FROM customer_products AS seat
			INNER JOIN customer_entitlements AS customer_entitlement
				ON customer_entitlement.customer_product_id = seat.id
			LEFT JOIN pooled_balance_contributions AS contribution
				ON contribution.id = customer_entitlement.pooled_contribution_id
			WHERE seat.customer_license_link_id = ${customerLicenseLinkId}
				AND seat.status IN (${activeStatusesSql})
				AND customer_entitlement.entitlement_id IN (${sqlList({ values: operation.fromEntitlementIds })})
			ORDER BY seat.created_at, seat.id, customer_entitlement.id
			FOR UPDATE OF customer_entitlement
			LIMIT ${batchSize + 1}
		),
		target_rows AS MATERIALIZED (
			SELECT target_ctid, pooled_balance_id
			FROM candidate_rows
			LIMIT ${batchSize}
		),
		deleted AS (
			DELETE FROM customer_entitlements AS customer_entitlement
			USING target_rows
			WHERE customer_entitlement.ctid = target_rows.target_ctid
			RETURNING 1
		),
		expired_pools AS (
			UPDATE pooled_balances AS pool
			SET expires_at = ${now}, updated_at = ${now}
			FROM (
				SELECT DISTINCT pooled_balance_id
				FROM target_rows
				WHERE pooled_balance_id IS NOT NULL
			) AS target_pool
			WHERE pool.id = target_pool.pooled_balance_id
				AND (SELECT COUNT(*) <= ${batchSize} FROM candidate_rows)
				AND (SELECT COUNT(*) FROM deleted) > 0
			RETURNING pool.id
		),
		expired_synthetic AS (
			UPDATE customer_entitlements AS synthetic
			SET
				expires_at = ${now},
				cache_version = COALESCE(synthetic.cache_version, 0) + 1
			FROM expired_pools
			WHERE synthetic.pooled_balance_id = expired_pools.id
				AND synthetic.customer_product_id IS NULL
			RETURNING 1
		)
		SELECT
			(SELECT COUNT(*)::int FROM deleted) AS affected,
			(SELECT COUNT(*) > ${batchSize} FROM candidate_rows) AS "hasMore",
			(SELECT COUNT(*) FROM expired_synthetic) AS expired
	`;

export const deleteCustomerEntitlementsBatch = async ({
	db,
	customerLicenseLinkId,
	operation,
	batchSize,
}: {
	db: DrizzleCli;
	customerLicenseLinkId: string;
	operation: RemoveEntitlementPriceOperation;
	batchSize: number;
}): Promise<BatchMutationResult> => {
	const query = buildDeleteCustomerEntitlementsBatchQuery({
		customerLicenseLinkId,
		operation,
		batchSize,
		now: Date.now(),
	});
	const [result] = await db.execute<BatchMutationResult>(query);
	return result ?? { affected: 0, hasMore: false };
};
