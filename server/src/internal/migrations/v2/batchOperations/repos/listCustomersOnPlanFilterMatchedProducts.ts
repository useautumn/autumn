import { MIGRATABLE_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";

/** Which of these customers hold at least one batch-eligible customer product
 * on a plan_filter-matched product? Matched → mutate + succeeded; rest → skipped. */
export const listCustomersOnPlanFilterMatchedProducts = async ({
	db,
	internalCustomerIds,
	planFilterMatchedProductIds,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	planFilterMatchedProductIds: string[];
}): Promise<Set<string>> => {
	if (
		internalCustomerIds.length === 0 ||
		planFilterMatchedProductIds.length === 0
	)
		return new Set();

	const rows = (await db.execute(sql`
		SELECT DISTINCT cp.internal_customer_id
		FROM customer_products AS cp
		WHERE cp.internal_customer_id IN (${sqlList({ values: internalCustomerIds })})
			AND cp.internal_product_id IN (${sqlList({ values: planFilterMatchedProductIds })})
			AND cp.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})
			AND cp.is_custom = false
			AND cp.customer_license_link_id IS NULL
	`)) as Array<{ internal_customer_id: string }>;

	return new Set(rows.map((row) => row.internal_customer_id));
};
