import { EntInterval } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { pageCustomerIdsCte } from "@/internal/migrations/v2/batchOperations/actions/utils/pageCustomerIdsSql.js";
import { BATCH_MIGRATION_MAX_DISTINCT_ENTITLEMENTS } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import {
	type OperationScope,
	operationScopeSql,
} from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import type { EntitlementPriceFilter } from "@/internal/migrations/v2/batchOperations/types/entitlementPriceFilter.js";

/** Renders a compiled filter over `entitlements AS definition`. */
export const entitlementPriceFilterSql = ({
	filter,
}: {
	filter: EntitlementPriceFilter;
}): SQL => {
	const featureId =
		filter.feature_id === undefined
			? sql``
			: sql`AND definition.feature_id = ${filter.feature_id}`;
	const interval =
		filter.interval === undefined
			? sql``
			: sql`AND COALESCE(definition.interval, ${EntInterval.Lifetime}) = ${filter.interval}`;
	const intervalCount =
		filter.interval_count === undefined
			? sql``
			: sql`AND COALESCE(definition.interval_count, 1) = ${filter.interval_count}`;
	const included =
		filter.included === undefined
			? sql``
			: sql`AND definition.allowance = ${filter.included}`;

	return sql`${featureId} ${interval} ${intervalCount} ${included}`;
};

/** Distinct live entitlement ids whose compiled filter matches.
 * Execute then deletes/replaces by those ids. No PlanItemFilter parsing. */
export const resolveFilterEntitlementIds = async ({
	db,
	internalCustomerIds,
	scope,
	filter,
	maxDistinctEntitlements = BATCH_MIGRATION_MAX_DISTINCT_ENTITLEMENTS,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	filter: EntitlementPriceFilter;
	maxDistinctEntitlements?: number;
}): Promise<string[]> => {
	if (internalCustomerIds.length === 0) return [];

	const rows = await db.execute<{ id: string }>(sql`
		WITH ${pageCustomerIdsCte({ internalCustomerIds })}
		SELECT DISTINCT live.entitlement_id AS id
		FROM page
		INNER JOIN customer_products AS cp
			ON cp.internal_customer_id = page.internal_customer_id
		INNER JOIN customer_entitlements AS live
			ON live.customer_product_id = cp.id
		INNER JOIN entitlements AS definition
			ON definition.id = live.entitlement_id
		WHERE ${operationScopeSql({ scope })}
			${entitlementPriceFilterSql({ filter })}
		LIMIT ${maxDistinctEntitlements + 1}
	`);
	const ids = rows.map((row) => row.id);

	if (ids.length > maxDistinctEntitlements) {
		throw new Error(
			`batch-migration: page exceeded ${maxDistinctEntitlements} distinct entitlement definitions — aborting run`,
		);
	}

	return ids;
};
