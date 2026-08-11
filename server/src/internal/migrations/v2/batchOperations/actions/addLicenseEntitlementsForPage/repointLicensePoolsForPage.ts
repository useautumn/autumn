import { MIGRATABLE_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import type { OperationScope } from "../../scope/operationScope.js";
import { operationScopeSql } from "../../scope/operationScope.js";

/** Granted stays derived: included moves, paid_quantity is billing-owned. */
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
}): Promise<{ pools: number; internalCustomerIds: string[] }> => {
	if (internalCustomerIds.length === 0)
		return { pools: 0, internalCustomerIds: [] };

	const updated = await db.execute<{ internal_customer_id: string }>(sql`
		UPDATE customer_licenses AS pool
		SET
			plan_license_id = ${planLicenseId},
			granted = target.included + pool.paid_quantity,
			remaining = GREATEST(
				pool.remaining + ((target.included + pool.paid_quantity) - pool.granted),
				0
			),
			updated_at = ${Date.now()}
		FROM customer_products AS cp, plan_license AS target
		WHERE cp.id = pool.parent_customer_product_id
			AND target.id = ${planLicenseId}
			AND pool.license_internal_product_id = ${licenseInternalProductId}
			AND pool.plan_license_id IS DISTINCT FROM ${planLicenseId}
			AND cp.internal_customer_id = ANY(${sql.param(internalCustomerIds)}::text[])
			AND ${operationScopeSql({ scope })}
			-- A link_id outlives plan transitions, so predecessor pools linger.
			-- Repoint only the one the candidate select will read back.
			AND pool.id = (
				SELECT live.id
				FROM customer_licenses AS live
				JOIN customer_products AS live_parent
					ON live_parent.id = live.parent_customer_product_id
				WHERE live.link_id = pool.link_id
					AND live.license_internal_product_id = ${licenseInternalProductId}
				ORDER BY (live_parent.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})) DESC,
					live.created_at DESC, live.id DESC
				LIMIT 1
			)
		RETURNING cp.internal_customer_id
	`);

	return {
		pools: updated.length,
		internalCustomerIds: [
			...new Set(updated.map((row) => row.internal_customer_id)),
		],
	};
};
