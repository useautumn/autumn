import { type SQL, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { ReplaceEntitlementPriceOperation } from "../../types/entitlementPriceOperationTypes";
import type { BatchMutationResult } from "../../types/types";
import { activeStatusesSql, sqlList } from "./batchTransitionSqlUtils";

const balanceAssignment = (
	operation: ReplaceEntitlementPriceOperation,
): SQL => {
	const patch = operation.customerEntitlementPatch.balance;
	if (!patch) return sql``;
	if (patch.type === "increment") {
		return sql`, balance = customer_entitlement.balance + ${patch.amount}`;
	}
	return sql`, balance = ${patch.amount}`;
};

export const replaceCustomerEntitlementsBatch = async ({
	db,
	customerLicenseLinkId,
	operation,
	batchSize,
}: {
	db: DrizzleCli;
	customerLicenseLinkId: string;
	operation: ReplaceEntitlementPriceOperation;
	batchSize: number;
}): Promise<BatchMutationResult> => {
	const targetEntitlement = operation.toEntitlementPrice.entitlement;
	const unlimitedAssignment =
		operation.customerEntitlementPatch.unlimited === undefined
			? sql``
			: sql`, unlimited = ${operation.customerEntitlementPatch.unlimited}`;
	const [result] = await db.execute<BatchMutationResult>(sql`
		WITH candidate_rows AS MATERIALIZED (
			SELECT customer_entitlement.ctid AS target_ctid
			FROM customer_products AS seat
			INNER JOIN customer_entitlements AS customer_entitlement
				ON customer_entitlement.customer_product_id = seat.id
			WHERE seat.customer_license_link_id = ${customerLicenseLinkId}
				AND seat.internal_entity_id IS NOT NULL
				AND seat.status IN (${activeStatusesSql})
				AND customer_entitlement.entitlement_id IN (${sqlList({ values: operation.fromEntitlementIds })})
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
				entitlement_id = ${operation.toEntitlementId},
				internal_feature_id = ${targetEntitlement.internal_feature_id},
				feature_id = ${targetEntitlement.feature.id},
				cache_version = COALESCE(customer_entitlement.cache_version, 0) + 1
				${balanceAssignment(operation)}
				${unlimitedAssignment}
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
