import type { AppEnv, CustomerListFilters } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import {
	liveCusEntPredicate,
	unlimitedUsedSumSql,
} from "../../liveCusEntSql.js";

/** `ce_balance_totals` computed live from Postgres for one org/env/feature,
 * using the same exact definitions as the verify pass. */
export const postgresBalanceTotalsCte = ({
	orgId,
	env,
	internalFeatureId,
	createdAtRange,
}: {
	orgId: string;
	env: AppEnv;
	internalFeatureId: string;
	createdAtRange?: CustomerListFilters["created_at_range"];
}): SQL => sql`
	WITH ce_sums AS (
		SELECT
			ce.internal_customer_id,
			COALESCE(BOOL_OR(ce.unlimited), false) AS is_unlimited,
			COALESCE(SUM(ce.balance) FILTER (WHERE ce.unlimited IS NOT TRUE), 0) AS total,
			COALESCE(SUM(
				COALESCE(e.allowance, 0) * COALESCE(cp.quantity, 1)
				+ COALESCE(ce.adjustment, 0)
			) FILTER (WHERE ce.unlimited IS NOT TRUE), 0) AS granted_total,
			COALESCE(${unlimitedUsedSumSql()}, 0) AS unlimited_used,
			COUNT(*) FILTER (WHERE ce.unlimited IS NOT TRUE) AS finite_rows
		FROM customer_entitlements ce
		JOIN customers c
			ON c.internal_id = ce.internal_customer_id
			AND c.org_id = ${orgId}
			AND c.env = ${env}
			${createdAtRange?.start !== undefined ? sql`AND c.created_at >= ${createdAtRange.start}` : sql``}
			${createdAtRange?.end !== undefined ? sql`AND c.created_at <= ${createdAtRange.end}` : sql``}
		LEFT JOIN customer_products cp ON cp.id = ce.customer_product_id
		LEFT JOIN entitlements e ON e.id = ce.entitlement_id
		WHERE ce.internal_feature_id = ${internalFeatureId}
			AND ${liveCusEntPredicate()}
		GROUP BY ce.internal_customer_id
	),
	ce_balance_totals AS (
		SELECT
			internal_customer_id,
			is_unlimited,
			total,
			granted_total,
			granted_total - total + unlimited_used AS usage_total,
			finite_rows
		FROM ce_sums
	)
`;
