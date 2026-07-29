import { MIGRATABLE_STATUSES } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";

/** Candidate scope shared by every page mutation; assumes customer_products
 * is aliased `cp`. Excludes is_custom rows and license assignments — customers
 * whose only rows are excluded end up skipped (per-customer lane retryable). */
export const customerProductsScopeFilter = ({
	internalCustomerIds,
	fromInternalProductId,
}: {
	internalCustomerIds: string[];
	fromInternalProductId: string;
}): SQL => sql`
	cp.internal_customer_id IN (${sqlList({ values: internalCustomerIds })})
	AND cp.internal_product_id = ${fromInternalProductId}
	AND cp.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})
	AND cp.is_custom = false
	AND cp.customer_license_link_id IS NULL
`;
