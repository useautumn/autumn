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

const retainedResetFilter = (
	operation: ReplaceEntitlementPriceOperation,
): SQL => {
	if (operation.fromEntitlementIds.length !== 1) return sql``;
	if (operation.fromEntitlementIds[0] !== operation.toEntitlementId)
		return sql``;
	const balancePatch = operation.customerEntitlementPatch.balance;
	if (balancePatch?.type === "set") {
		return sql`AND customer_entitlement.balance IS DISTINCT FROM ${balancePatch.amount}`;
	}
	return sql``;
};

const pooledAggregateCtes = (
	operation: ReplaceEntitlementPriceOperation,
): SQL => {
	const patch = operation.pooledContributionPatch;
	if (!patch) return sql``;
	const now = Date.now();
	const contributionAssignment =
		patch.type === "increment"
			? sql`
				current_contribution = contribution.current_contribution + ${patch.amount},
				next_cycle_contribution = contribution.next_cycle_contribution + ${patch.amount}`
			: sql`
				current_contribution = ${patch.amount},
				next_cycle_contribution = ${patch.amount}`;
	const syntheticBalanceAssignment =
		patch.type === "increment"
			? sql`COALESCE(synthetic.balance, 0) + pool_deltas.amount`
			: sql`updated_pools.granted`;
	return sql`,
		contribution_rows AS MATERIALIZED (
			SELECT
				contribution.ctid AS target_ctid,
				contribution.pooled_balance_id,
				contribution.current_contribution
			FROM updated
			INNER JOIN pooled_balance_contributions AS contribution
				ON contribution.id = updated.pooled_contribution_id
		),
		updated_contributions AS (
			UPDATE pooled_balance_contributions AS contribution
			SET
				${contributionAssignment},
				updated_at = ${now}
			FROM contribution_rows
			WHERE contribution.ctid = contribution_rows.target_ctid
			RETURNING
				contribution.pooled_balance_id,
				${
					patch.type === "increment"
						? sql`${patch.amount}`
						: sql`${patch.amount} - contribution_rows.current_contribution`
				} AS amount
		),
		pool_deltas AS (
			SELECT
				pooled_balance_id,
				SUM(amount::numeric) AS amount
			FROM updated_contributions
			GROUP BY pooled_balance_id
		),
		updated_pools AS (
			UPDATE pooled_balances AS pool
			SET
				granted = pool.granted + pool_deltas.amount,
				updated_at = ${now}
			FROM pool_deltas
			WHERE pool.id = pool_deltas.pooled_balance_id
			RETURNING pool.id, pool.granted
		),
		updated_synthetic AS (
			UPDATE customer_entitlements AS synthetic
			SET
				balance = ${syntheticBalanceAssignment},
				cache_version = COALESCE(synthetic.cache_version, 0) + 1
			FROM pool_deltas
			INNER JOIN updated_pools
				ON updated_pools.id = pool_deltas.pooled_balance_id
			WHERE synthetic.pooled_balance_id = updated_pools.id
				AND synthetic.customer_product_id IS NULL
			RETURNING 1
		)`;
};

export const buildReplaceCustomerEntitlementsBatchQuery = ({
	customerLicenseLinkId,
	operation,
	batchSize,
}: {
	customerLicenseLinkId: string;
	operation: ReplaceEntitlementPriceOperation;
	batchSize: number;
}): SQL => {
	const targetEntitlement = operation.toEntitlementPrice.entitlement;
	const unlimitedAssignment =
		operation.customerEntitlementPatch.unlimited === undefined
			? sql``
			: sql`, unlimited = ${operation.customerEntitlementPatch.unlimited}`;
	return sql`
		WITH candidate_rows AS MATERIALIZED (
			SELECT customer_entitlement.ctid AS target_ctid
			FROM customer_products AS seat
			INNER JOIN customer_entitlements AS customer_entitlement
				ON customer_entitlement.customer_product_id = seat.id
			WHERE seat.customer_license_link_id = ${customerLicenseLinkId}
				${assignedSeatFilter(operation)}
				AND seat.status IN (${activeStatusesSql})
				AND customer_entitlement.entitlement_id IN (${sqlList({ values: operation.fromEntitlementIds })})
				${retainedResetFilter(operation)}
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
			RETURNING
				customer_entitlement.id,
				customer_entitlement.pooled_contribution_id
		)
		${pooledAggregateCtes(operation)}
		SELECT
			(SELECT COUNT(*)::int FROM updated) AS affected,
			(SELECT COUNT(*) > ${batchSize} FROM candidate_rows) AS "hasMore"
	`;
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
	const query = buildReplaceCustomerEntitlementsBatchQuery({
		customerLicenseLinkId,
		operation,
		batchSize,
	});
	const [result] = await db.execute<BatchMutationResult>(query);
	return result ?? { affected: 0, hasMore: false };
};
