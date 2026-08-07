import { MIGRATABLE_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import type { OperationScope } from "../../scope/operationScope.js";
import { operationScopeSql } from "../../scope/operationScope.js";

/**
 * Points every matched parent's pool at the prepared customized link. Runs
 * before the entitlement fan-out, which reads the pool to find the definition.
 * Granted stays derived: included moves, paid_quantity is billing-owned.
 */
export const repointLicensePoolsForPage = async ({
	db,
	internalCustomerIds,
	scope,
	planLicenseId,
	licenseInternalProductId,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	planLicenseId: string;
	licenseInternalProductId: string;
}): Promise<number> => {
	if (internalCustomerIds.length === 0) return 0;

	const updated = await db.execute<{ id: string }>(sql`
		UPDATE customer_licenses AS pool
		SET
			plan_license_id = ${planLicenseId},
			granted = ${sql.raw("target.included")} + pool.paid_quantity,
			remaining = GREATEST(
				pool.remaining + ((${sql.raw("target.included")} + pool.paid_quantity) - pool.granted),
				0
			),
			updated_at = ${Date.now()}
		FROM customer_products AS cp, plan_license AS target
		WHERE cp.id = pool.parent_customer_product_id
			AND target.id = ${planLicenseId}
			AND pool.license_internal_product_id = ${licenseInternalProductId}
			AND pool.plan_license_id IS DISTINCT FROM ${planLicenseId}
			AND cp.internal_customer_id = ANY(${sql.param(internalCustomerIds)}::text[])
			AND cp.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})
			AND ${operationScopeSql({ scope })}
		RETURNING pool.id
	`);

	return updated.length;
};
