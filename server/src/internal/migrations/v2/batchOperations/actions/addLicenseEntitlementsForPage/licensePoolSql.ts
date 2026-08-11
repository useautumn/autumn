import { MIGRATABLE_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";

/** link_id is copied to every successor row, so an assignment can reach several
 * pools; the live parent wins because it is the one that bills the seat. */
export const canonicalPoolLateralSql = ({
	licenseInternalProductId,
	columns = sql`pool.parent_customer_product_id`,
}: {
	licenseInternalProductId: string;
	columns?: ReturnType<typeof sql>;
}) => sql`
	JOIN LATERAL (
		SELECT ${columns}
		FROM customer_licenses AS pool
		JOIN customer_products AS pool_parent
			ON pool_parent.id = pool.parent_customer_product_id
		WHERE pool.link_id = assignment.customer_license_link_id
			AND pool.license_internal_product_id = ${licenseInternalProductId}
		ORDER BY (pool_parent.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})) DESC,
			pool.created_at DESC, pool.id DESC
		LIMIT 1
	) AS pool ON true
`;

export const liveAssignmentSql = () => sql`
	assignment.internal_entity_id IS NOT NULL
	AND assignment.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})
`;
