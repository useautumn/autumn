import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

const sqlIdList = (ids: string[]) =>
	sql.join(
		ids.map((id) => sql`${id}`),
		sql`, `,
	);

/** Removes the pool contributions fed by these entities' products and returns
 * the pools they fed. Runs before the entity delete: depending on the FK, its
 * products are either cascaded away or left behind with no entity, and in
 * neither case should they keep feeding a customer pool. License pools are left
 * to the license lifecycle. */
export const removeEntityPoolContributions = async ({
	db,
	internalEntityIds,
}: {
	db: DrizzleCli;
	internalEntityIds: string[];
}): Promise<string[]> => {
	if (internalEntityIds.length === 0) return [];

	const entityIdList = sqlIdList(internalEntityIds);
	const entityContributions = sql`
		SELECT contribution.id, contribution.pooled_balance_id
		FROM pooled_balance_contributions AS contribution
		INNER JOIN pooled_balances AS pool
			ON pool.id = contribution.pooled_balance_id
		LEFT JOIN customer_products AS source_product
			ON source_product.id = contribution.source_customer_product_id
		LEFT JOIN customer_entitlements AS source_entitlement
			ON source_entitlement.id = contribution.source_customer_entitlement_id
		WHERE pool.customer_license_link_id IS NULL
			AND (
				source_product.internal_entity_id IN (${entityIdList})
				OR source_entitlement.internal_entity_id IN (${entityIdList})
			)
	`;

	// Concurrent deletes of a pool's last contributors queue on this lock, so
	// the later one's expiry check sees the earlier one's removal.
	await db.execute(sql`
		SELECT pool.id
		FROM pooled_balances AS pool
		WHERE pool.id IN (
			SELECT entity_contribution.pooled_balance_id
			FROM (${entityContributions}) AS entity_contribution
		)
		ORDER BY pool.id
		FOR UPDATE
	`);

	const removed = await db.execute<{ pooled_balance_id: string }>(sql`
		WITH target_contributions AS MATERIALIZED (${entityContributions}),
		detached_sources AS (
			UPDATE customer_entitlements AS source_entitlement
			SET pooled_contribution_id = NULL
			FROM target_contributions
			WHERE source_entitlement.pooled_contribution_id = target_contributions.id
			RETURNING 1
		),
		deleted_contributions AS (
			DELETE FROM pooled_balance_contributions AS contribution
			USING target_contributions
			WHERE contribution.id = target_contributions.id
			RETURNING contribution.pooled_balance_id
		)
		SELECT DISTINCT pooled_balance_id FROM deleted_contributions
	`);
	return removed.map((row) => row.pooled_balance_id);
};

/** Expires each pool, and its synthetic entitlement, once no contribution
 * remains — the same end state as the billing flow's pool expiry. */
export const expireOrphanedPools = async ({
	db,
	poolIds,
	now = Date.now(),
}: {
	db: DrizzleCli;
	poolIds: string[];
	now?: number;
}) => {
	if (poolIds.length === 0) return;

	await db.execute(sql`
		WITH expired_pools AS (
			UPDATE pooled_balances AS pool
			SET expires_at = ${now}, updated_at = ${now}
			WHERE pool.id IN (${sqlIdList(poolIds)})
				AND pool.customer_license_link_id IS NULL
				AND (pool.expires_at IS NULL OR pool.expires_at > ${now})
				AND NOT EXISTS (
					SELECT 1
					FROM pooled_balance_contributions AS remaining_contribution
					WHERE remaining_contribution.pooled_balance_id = pool.id
				)
			RETURNING pool.id
		)
		UPDATE customer_entitlements AS synthetic
		SET
			expires_at = ${now},
			cache_version = COALESCE(synthetic.cache_version, 0) + 1
		FROM expired_pools
		WHERE synthetic.pooled_balance_id = expired_pools.id
			AND synthetic.customer_product_id IS NULL
	`);
};
