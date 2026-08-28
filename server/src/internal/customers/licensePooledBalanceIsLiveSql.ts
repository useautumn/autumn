import { RELEVANT_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";

/** License-keyed pools inherit parent liveness the same way seats do:
 * no write-path expire — a dead parent hides the pool at read time. */
export const licensePooledBalanceIsLiveSql = ({
	pooledBalanceAlias = "pb",
}: {
	pooledBalanceAlias?: string;
} = {}) => {
	const pb = sql.raw(pooledBalanceAlias);
	return sql`(
		${pb}.customer_license_link_id IS NULL
		OR EXISTS (
			SELECT 1
			FROM customer_licenses pool
			JOIN customer_products pool_parent
				ON pool_parent.id = pool.parent_customer_product_id
			WHERE pool.link_id = ${pb}.customer_license_link_id
				AND pool.internal_customer_id = ${pb}.internal_customer_id
				AND pool_parent.status IN (${sql.join(
					RELEVANT_STATUSES.map((status) => sql`${status}`),
					sql`, `,
				)})
		)
	)`;
};
