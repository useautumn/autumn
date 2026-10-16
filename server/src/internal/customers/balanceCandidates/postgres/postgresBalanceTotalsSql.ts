import type { AppEnv, CustomerListFilters } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { buildSearchPredicates } from "../../CusSearchService.js";
import {
	liveCusEntPredicate,
	unlimitedUsedSumSql,
} from "../../liveCusEntSql.js";

/** `ce_balance_totals` computed live from Postgres for one org/env/feature,
 * using the verify pass's exact definitions. Search and customer filters apply
 * before ranking, so the batch LIMIT never cuts off a matching customer. */
export const postgresBalanceTotalsCte = ({
	orgId,
	env,
	internalFeatureId,
	search = "",
	filters,
}: {
	orgId: string;
	env: AppEnv;
	internalFeatureId: string;
	search?: string;
	filters?: CustomerListFilters;
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
		JOIN customers
			ON customers.internal_id = ce.internal_customer_id
			AND ${buildSearchPredicates({ orgId, env, search, filters }).whereRaw}
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
