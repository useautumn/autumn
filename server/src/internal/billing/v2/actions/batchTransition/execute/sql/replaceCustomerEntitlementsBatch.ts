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

const assignedSeatFilter = (
	operation: ReplaceEntitlementPriceOperation,
): SQL =>
	operation.pooledContributionPatch
		? sql``
		: sql`AND seat.internal_entity_id IS NOT NULL`;

const pooledAggregateCtes = (
	operation: ReplaceEntitlementPriceOperation,
): SQL => {
	const amount = operation.pooledContributionPatch?.amount;
	if (!amount) return sql``;
	const now = Date.now();
	return sql`,
		updated_contributions AS (
			UPDATE pooled_balance_contributions AS contribution
			SET
				current_contribution = contribution.current_contribution + ${amount},
				next_cycle_contribution = contribution.next_cycle_contribution + ${amount},
				updated_at = ${now}
			FROM updated
			WHERE contribution.source_customer_entitlement_id = updated.id
			RETURNING contribution.pooled_balance_id
		),
		pool_deltas AS (
			SELECT
				pooled_balance_id,
				COUNT(*)::int AS contribution_count
			FROM updated_contributions
			GROUP BY pooled_balance_id
		),
		updated_pools AS (
			UPDATE pooled_balances AS pool
			SET
				granted = pool.granted + (${amount} * pool_deltas.contribution_count),
				updated_at = ${now}
			FROM pool_deltas
			WHERE pool.id = pool_deltas.pooled_balance_id
			RETURNING 1
		),
		updated_synthetic AS (
			UPDATE customer_entitlements AS synthetic
			SET
				balance = COALESCE(synthetic.balance, 0) + (${amount} * pool_deltas.contribution_count),
				cache_version = COALESCE(synthetic.cache_version, 0) + 1
			FROM pool_deltas
			WHERE synthetic.pooled_balance_id = pool_deltas.pooled_balance_id
				AND synthetic.customer_product_id IS NULL
			RETURNING 1
		)`;
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
				${assignedSeatFilter(operation)}
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
			RETURNING customer_entitlement.id
		)
		${pooledAggregateCtes(operation)}
		SELECT
			(SELECT COUNT(*)::int FROM updated) AS affected,
			(SELECT COUNT(*) > ${batchSize} FROM candidate_rows) AS "hasMore"
	`);

	return result ?? { affected: 0, hasMore: false };
};
