import {
	type AggregatedFeatureBalance,
	AggregatedFeatureBalanceSchema,
	type AppEnv,
	type CusProductStatus,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { getEntityAggregateFragments } from "@/internal/customers/repos/getFullSubject/getEntityAggregateFragments.js";

/**
 * Focused query that computes ONLY the entity aggregated customer entitlements
 * for a single customer. Reuses the CTE builders from getEntityAggregateFragments
 * but skips all non-aggregate CTEs (products, prices, subscriptions, invoices).
 * Used by the sync worker to refresh `_aggregated` on balance hashes after DB sync.
 */
export const getEntityAggregateForSync = async ({
	db,
	orgId,
	env,
	customerId,
	inStatuses = RELEVANT_STATUSES,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	customerId: string;
	inStatuses?: CusProductStatus[];
}): Promise<AggregatedFeatureBalance[]> => {
	const statusFilter =
		inStatuses.length > 0
			? sql`AND cp.status = ANY(ARRAY[${sql.join(
					inStatuses.map((status) => sql`${status}`),
					sql`, `,
				)}])`
			: sql``;

	const entityFragments = getEntityAggregateFragments({
		statusFilter,
	});

	const query = sql`
		WITH subject_customer_records AS (
			SELECT *
			FROM customers c
			WHERE c.org_id = ${orgId}
				AND c.env = ${env}
				AND (c.id = ${customerId} OR c.internal_id = ${customerId})
			ORDER BY (c.id = ${customerId}) DESC
			LIMIT 1
		)

		${entityFragments.ctes}

		SELECT *
		FROM entity_aggregated_cus_entitlements
	`;

	const result = await db.execute(query);
	if (!result?.length) return [];

	return (result as unknown as Record<string, unknown>[])
		.map((row) => AggregatedFeatureBalanceSchema.safeParse(row))
		.filter((parsed) => parsed.success)
		.map((parsed) => parsed.data as AggregatedFeatureBalance);
};
