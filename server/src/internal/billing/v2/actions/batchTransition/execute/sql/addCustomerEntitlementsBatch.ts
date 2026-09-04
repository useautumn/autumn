import { type SQL, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AddEntitlementPriceOperation } from "../../types/entitlementPriceOperationTypes";
import type { BatchMutationResult } from "../../types/types";
import { activeStatusesSql, sqlList } from "./batchTransitionSqlUtils";

const generatedContributionIdsCte = ({
	contributionIds,
}: {
	contributionIds: string[];
}): SQL => sql`,
		generated_contribution_ids AS MATERIALIZED (
			SELECT generated.id, generated.ordinality
			FROM JSONB_ARRAY_ELEMENTS_TEXT(${JSON.stringify(contributionIds)}::jsonb)
				WITH ORDINALITY AS generated(id, ordinality)
		)`;

// Same-statement UPDATE cannot see rows from `inserted` (CTE snapshot).
// Write pooled_contribution_id on INSERT; never gate the granted bump on that UPDATE.
const addPooledContributionsCtes = ({
	pooledBalanceId,
	contributionAmount,
	now,
}: {
	pooledBalanceId: string;
	contributionAmount: number;
	now: number;
}): SQL => sql`,
		inserted_contributions AS (
			INSERT INTO pooled_balance_contributions (
				id,
				pooled_balance_id,
				source_customer_product_id,
				source_customer_entitlement_id,
				current_contribution,
				next_cycle_contribution,
				effective_at,
				created_at,
				updated_at
			)
			SELECT
				contribution_id.id,
				${pooledBalanceId},
				inserted.customer_product_id,
				inserted.id,
				${contributionAmount},
				${contributionAmount},
				NULL,
				${now},
				${now}
			FROM inserted
			INNER JOIN generated_ids
				ON generated_ids.id = inserted.id
			INNER JOIN generated_contribution_ids AS contribution_id
				ON contribution_id.ordinality = generated_ids.ordinality
			ON CONFLICT (source_customer_entitlement_id) DO NOTHING
			RETURNING id, source_customer_entitlement_id
		),
		pool_deltas AS (
			SELECT COUNT(*)::int AS contribution_count
			FROM inserted_contributions
		),
		updated_pools AS (
			UPDATE pooled_balances AS pool
			SET
				granted = CASE
					WHEN pool.customer_license_link_id IS NOT NULL THEN pool.granted
					ELSE pool.granted + (${contributionAmount} * pool_deltas.contribution_count)
				END,
				updated_at = ${now}
			FROM pool_deltas
			WHERE pool.id = ${pooledBalanceId}
			RETURNING pool.customer_license_link_id, pool_deltas.contribution_count
		),
		updated_synthetic AS (
			UPDATE customer_entitlements AS synthetic
			SET
				balance = CASE
					WHEN updated_pools.customer_license_link_id IS NOT NULL
						THEN synthetic.balance
					ELSE COALESCE(synthetic.balance, 0) + (${contributionAmount} * updated_pools.contribution_count)
				END,
				cache_version = COALESCE(synthetic.cache_version, 0) + 1
			FROM updated_pools
			WHERE synthetic.pooled_balance_id = ${pooledBalanceId}
				AND synthetic.customer_product_id IS NULL
			RETURNING 1
		)`;

export const buildAddCustomerEntitlementsBatchQuery = ({
	customerLicenseLinkId,
	assignmentCutoffMs,
	customerEntitlementIds,
	operation,
	batchSize,
	pooledBalanceId,
	contributionIds,
}: {
	customerLicenseLinkId: string;
	assignmentCutoffMs: number;
	customerEntitlementIds: string[];
	operation: AddEntitlementPriceOperation;
	batchSize: number;
	pooledBalanceId?: string;
	contributionIds?: string[];
}): SQL => {
	if (operation.existingEntitlementIds.length === 0) {
		throw new Error("Customer entitlement addition requires candidate IDs");
	}
	if (customerEntitlementIds.length !== batchSize) {
		throw new Error("Customer entitlement addition requires one ID per row");
	}
	if (
		pooledBalanceId &&
		(!contributionIds || contributionIds.length !== batchSize)
	) {
		throw new Error(
			"Pooled entitlement addition requires one contribution ID per row",
		);
	}

	const customerEntitlement = operation.customerEntitlement;
	const pooledAdd =
		pooledBalanceId && contributionIds && operation.pooledAdd
			? {
					pooledBalanceId,
					contributionIds,
					contributionAmount: operation.pooledAdd.contributionAmount,
				}
			: undefined;
	return sql`
		WITH candidate_rows AS MATERIALIZED (
			SELECT seat.id, seat.created_at
			FROM customer_products AS seat
			WHERE seat.customer_license_link_id = ${customerLicenseLinkId}
				AND seat.status IN (${activeStatusesSql})
				AND (seat.created_at IS NULL OR seat.created_at <= ${assignmentCutoffMs})
				AND NOT EXISTS (
					SELECT 1
					FROM customer_entitlements AS existing
					WHERE existing.customer_product_id = seat.id
						AND existing.entitlement_id IN (${sqlList({ values: operation.existingEntitlementIds })})
				)
			ORDER BY seat.created_at, seat.id
			FOR UPDATE OF seat
			LIMIT ${batchSize + 1}
		),
		target_rows AS MATERIALIZED (
			SELECT
				id,
				ROW_NUMBER() OVER (ORDER BY created_at, id) AS ordinal
			FROM candidate_rows
			LIMIT ${batchSize}
		),
		generated_ids AS MATERIALIZED (
			SELECT generated.id, generated.ordinality
			FROM JSONB_ARRAY_ELEMENTS_TEXT(${JSON.stringify(customerEntitlementIds)}::jsonb)
				WITH ORDINALITY AS generated(id, ordinality)
		)
		${pooledAdd ? generatedContributionIdsCte({ contributionIds: pooledAdd.contributionIds }) : sql``},
		inserted AS (
			INSERT INTO customer_entitlements (
				id,
				customer_product_id,
				entitlement_id,
				internal_customer_id,
				internal_entity_id,
				internal_feature_id,
				unlimited,
				balance,
				created_at,
				reset_cycle_anchor,
				next_reset_at,
				usage_allowed,
				separate_interval,
				adjustment,
				additional_balance,
				entities,
				expires_at,
				cache_version,
				customer_id,
				feature_id,
				external_id
				${pooledAdd ? sql`, pooled_contribution_id` : sql``}
			)
			SELECT
				generated.id,
				target.id,
				${customerEntitlement.entitlement_id},
				${customerEntitlement.internal_customer_id},
				NULL,
				${customerEntitlement.internal_feature_id},
				${customerEntitlement.unlimited},
				${customerEntitlement.balance},
				${customerEntitlement.created_at},
				${customerEntitlement.reset_cycle_anchor},
				${customerEntitlement.next_reset_at},
				${customerEntitlement.usage_allowed},
				${customerEntitlement.separate_interval},
				${customerEntitlement.adjustment},
				${customerEntitlement.additional_balance},
				${customerEntitlement.entities ? JSON.stringify(customerEntitlement.entities) : null}::jsonb,
				${customerEntitlement.expires_at},
				${customerEntitlement.cache_version},
				${customerEntitlement.customer_id},
				${customerEntitlement.feature_id},
				${customerEntitlement.external_id}
				${pooledAdd ? sql`, contribution_id.id` : sql``}
			FROM target_rows AS target
			INNER JOIN generated_ids AS generated
				ON generated.ordinality = target.ordinal
			${
				pooledAdd
					? sql`INNER JOIN generated_contribution_ids AS contribution_id
				ON contribution_id.ordinality = generated.ordinality`
					: sql``
			}
			ON CONFLICT (id) DO NOTHING
			RETURNING id, customer_product_id
		)
		${
			pooledAdd
				? addPooledContributionsCtes({
						pooledBalanceId: pooledAdd.pooledBalanceId,
						contributionAmount: pooledAdd.contributionAmount,
						now: Date.now(),
					})
				: sql``
		}
		SELECT
			(SELECT COUNT(*)::int FROM inserted) AS affected,
			(
				(SELECT COUNT(*) > ${batchSize} FROM candidate_rows)
				OR
				(SELECT COUNT(*) FROM inserted) < (SELECT COUNT(*) FROM target_rows)
			) AS "hasMore"
	`;
};

export const addCustomerEntitlementsBatch = async ({
	db,
	...params
}: {
	db: DrizzleCli;
	customerLicenseLinkId: string;
	assignmentCutoffMs: number;
	customerEntitlementIds: string[];
	operation: AddEntitlementPriceOperation;
	batchSize: number;
	pooledBalanceId?: string;
	contributionIds?: string[];
}): Promise<BatchMutationResult> => {
	const query = buildAddCustomerEntitlementsBatchQuery(params);
	const [result] = await db.execute<BatchMutationResult>(query);

	return result ?? { affected: 0, hasMore: false };
};
