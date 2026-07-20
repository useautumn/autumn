import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { CustomerEntitlementCycleOperation } from "../../types/customerEntitlementCycleOperationTypes";
import type { BatchMutationResult } from "../../types/types";
import { activeStatusesSql, sqlList } from "./batchTransitionSqlUtils";

export const alignCustomerEntitlementCyclesBatch = async ({
	db,
	customerLicenseLinkId,
	operation,
	batchSize,
}: {
	db: DrizzleCli;
	customerLicenseLinkId: string;
	operation: CustomerEntitlementCycleOperation;
	batchSize: number;
}): Promise<BatchMutationResult> => {
	const [result] = await db.execute<BatchMutationResult>(sql`
		WITH candidate_rows AS MATERIALIZED (
			SELECT customer_entitlement.ctid AS target_ctid
			FROM customer_products AS seat
			INNER JOIN customer_entitlements AS customer_entitlement
				ON customer_entitlement.customer_product_id = seat.id
			WHERE seat.customer_license_link_id = ${customerLicenseLinkId}
				AND seat.internal_entity_id IS NOT NULL
				AND seat.status IN (${activeStatusesSql})
				AND customer_entitlement.entitlement_id IN (${sqlList({ values: operation.entitlementIds })})
				AND (
					customer_entitlement.reset_cycle_anchor IS DISTINCT FROM ${operation.resetCycleAnchor}
					OR customer_entitlement.next_reset_at IS DISTINCT FROM ${operation.nextResetAt}
				)
			ORDER BY seat.created_at, seat.id, customer_entitlement.id
			FOR UPDATE OF customer_entitlement
			LIMIT ${batchSize + 1}
		),
		target_rows AS MATERIALIZED (
			SELECT target_ctid
			FROM candidate_rows
			LIMIT ${batchSize}
		),
		updated AS (
			UPDATE customer_entitlements AS customer_entitlement
			SET
				reset_cycle_anchor = ${operation.resetCycleAnchor},
				next_reset_at = ${operation.nextResetAt},
				cache_version = COALESCE(customer_entitlement.cache_version, 0) + 1
			FROM target_rows
			WHERE customer_entitlement.ctid = target_rows.target_ctid
			RETURNING 1
		)
		SELECT
			(SELECT COUNT(*)::int FROM updated) AS affected,
			(SELECT COUNT(*) > ${batchSize} FROM candidate_rows) AS "hasMore"
	`);

	return result ?? { affected: 0, hasMore: false };
};
