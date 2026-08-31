import { type SQL, sql } from "drizzle-orm";

const leftoverContributionsExistSql = sql`
			EXISTS (
				SELECT 1
				FROM pooled_balance_contributions AS contribution
				WHERE contribution.pooled_balance_id = pool.id
					AND NOT EXISTS (
						SELECT 1
						FROM locked_contributions AS locked
						WHERE locked.id = contribution.id
					)
			)`;

export const pooledRemoveBatchCtes = ({ now }: { now: number }): SQL => sql`,
		locked_contributions AS MATERIALIZED (
			SELECT
				contribution.id,
				contribution.pooled_balance_id,
				contribution.current_contribution
			FROM pooled_balance_contributions AS contribution
			INNER JOIN customer_entitlements AS customer_entitlement
				ON customer_entitlement.id = contribution.source_customer_entitlement_id
			INNER JOIN target_rows
				ON customer_entitlement.id = target_rows.target_id
		),
		deleted_contributions AS (
			DELETE FROM pooled_balance_contributions AS contribution
			USING locked_contributions
			WHERE contribution.id = locked_contributions.id
			RETURNING contribution.pooled_balance_id, contribution.current_contribution
		),
		pool_deltas AS (
			SELECT
				pooled_balance_id,
				COUNT(*)::int AS contribution_count,
				SUM(current_contribution) AS granted_delta
			FROM deleted_contributions
			GROUP BY pooled_balance_id
		),
		updated_pools AS (
			UPDATE pooled_balances AS pool
			SET
				granted = pool.granted - pool_deltas.granted_delta,
				expires_at = CASE
					WHEN ${leftoverContributionsExistSql} THEN pool.expires_at
					ELSE ${now}
				END,
				updated_at = ${now}
			FROM pool_deltas
			WHERE pool.id = pool_deltas.pooled_balance_id
			RETURNING pool.id, pool.expires_at
		),
		updated_synthetic AS (
			UPDATE customer_entitlements AS synthetic
			SET
				balance = COALESCE(synthetic.balance, 0) - pool_deltas.granted_delta,
				expires_at = updated_pools.expires_at,
				cache_version = COALESCE(synthetic.cache_version, 0) + 1
			FROM pool_deltas, updated_pools
			WHERE synthetic.pooled_balance_id = pool_deltas.pooled_balance_id
				AND synthetic.customer_product_id IS NULL
			RETURNING 1
		)`;
