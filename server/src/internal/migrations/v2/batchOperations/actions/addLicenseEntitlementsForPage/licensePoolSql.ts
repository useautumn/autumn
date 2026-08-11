import { ACTIVE_STATUSES, MIGRATABLE_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";

/** A pool pins the license product version it was attached under, so matching on
 * the plan's public id keeps versioned seats reachable — the identity
 * matchCustomerLicenseSuccessors already resolves through. */
export const poolLicensePlanSql = ({
	licensePlanId,
	poolAlias = sql`pool`,
}: {
	licensePlanId: string;
	poolAlias?: ReturnType<typeof sql>;
}) => sql`
	EXISTS (
		SELECT 1
		FROM products AS pool_license_product
		WHERE pool_license_product.internal_id = ${poolAlias}.license_internal_product_id
			AND pool_license_product.id = ${licensePlanId}
	)
`;

/** A live parent outranks a scheduled successor: it is the one billing the seat. */
export const canonicalPoolOrderingSql = ({
	parentAlias,
	poolAlias,
}: {
	parentAlias: ReturnType<typeof sql>;
	poolAlias: ReturnType<typeof sql>;
}) => sql`
	ORDER BY (${parentAlias}.status IN (${sqlList({ values: [...ACTIVE_STATUSES] })})) DESC,
		(${parentAlias}.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})) DESC,
		${poolAlias}.created_at DESC, ${poolAlias}.id DESC
`;

/** link_id is copied to every successor row, so an assignment can reach several
 * pools; the live parent wins because it is the one that bills the seat. */
export const canonicalPoolLateralSql = ({
	licensePlanId,
	columns = sql`pool.parent_customer_product_id`,
}: {
	licensePlanId: string;
	columns?: ReturnType<typeof sql>;
}) => sql`
	JOIN LATERAL (
		SELECT ${columns}
		FROM customer_licenses AS pool
		JOIN customer_products AS pool_parent
			ON pool_parent.id = pool.parent_customer_product_id
		WHERE pool.link_id = assignment.customer_license_link_id
			AND ${poolLicensePlanSql({ licensePlanId })}
		${canonicalPoolOrderingSql({
			parentAlias: sql`pool_parent`,
			poolAlias: sql`pool`,
		})}
		LIMIT 1
	) AS pool ON true
`;
