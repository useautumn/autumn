import { type SQL, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { RemoveEntitlementPriceOperation } from "../../types/entitlementPriceOperationTypes";
import type { BatchMutationResult } from "../../types/types";
import { activeStatusesSql, sqlList } from "./batchTransitionSqlUtils";
import { pooledRemoveBatchCtes } from "./pooledRemoveBatchCtes";

const assignedSeatFilter = (
	operation: RemoveEntitlementPriceOperation,
): SQL =>
	operation.entitlementPrice.entitlement.pooled === true
		? sql``
		: sql`AND seat.internal_entity_id IS NOT NULL`;

const pooledRemoveCtes = ({
	operation,
	now,
}: {
	operation: RemoveEntitlementPriceOperation;
	now: number;
}): SQL =>
	operation.entitlementPrice.entitlement.pooled === true
		? pooledRemoveBatchCtes({ now })
		: sql``;

const deletedCte = ({
	operation,
}: {
	operation: RemoveEntitlementPriceOperation;
}): SQL =>
	operation.entitlementPrice.entitlement.pooled === true
		? sql`
		deleted AS (
			DELETE FROM customer_entitlements AS customer_entitlement
			USING target_rows
			WHERE customer_entitlement.id = target_rows.target_id
				AND (SELECT COALESCE(COUNT(*), 0) FROM updated_synthetic) >= 0
			RETURNING 1
		)`
		: sql`
		deleted AS (
			DELETE FROM customer_entitlements AS customer_entitlement
			USING target_rows
			WHERE customer_entitlement.ctid = target_rows.target_ctid
			RETURNING 1
		)`;

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
	const now = Date.now();
	const [result] = await db.execute<BatchMutationResult>(sql`
		WITH candidate_rows AS MATERIALIZED (
			SELECT
				customer_entitlement.ctid AS target_ctid,
				customer_entitlement.id AS target_id
			FROM customer_products AS seat
			INNER JOIN customer_entitlements AS customer_entitlement
				ON customer_entitlement.customer_product_id = seat.id
			WHERE seat.customer_license_link_id = ${customerLicenseLinkId}
				${assignedSeatFilter(operation)}
				AND seat.status IN (${activeStatusesSql})
				AND customer_entitlement.entitlement_id IN (${sqlList({ values: operation.fromEntitlementIds })})
			ORDER BY seat.created_at, seat.id, customer_entitlement.id
			FOR UPDATE OF customer_entitlement
			LIMIT ${batchSize + 1}
		),
		target_rows AS MATERIALIZED (
			SELECT target_ctid, target_id
			FROM candidate_rows
			LIMIT ${batchSize}
		)
		${pooledRemoveCtes({ operation, now })}
		, ${deletedCte({ operation })}
		SELECT
			(SELECT COUNT(*)::int FROM deleted) AS affected,
			(SELECT COUNT(*) > ${batchSize} FROM candidate_rows) AS "hasMore"
	`);

	return result ?? { affected: 0, hasMore: false };
};
