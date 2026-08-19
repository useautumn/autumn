import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { OperationScope } from "../../scope/operationScope.js";
import { operationScopeSql } from "../../scope/operationScope.js";
import {
	canonicalPoolOrderingSql,
	poolLicensePlanSql,
} from "../licensePoolSql.js";
import { pageCustomerIdsCte } from "../utils/pageCustomerIdsSql.js";

/** Granted stays derived: included moves, paid_quantity is billing-owned. */
export const repointLicensePoolRows = async ({
	db,
	internalCustomerIds,
	scope,
	planLicenseId,
	licensePlanId,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	planLicenseId: string;
	licensePlanId: string;
}): Promise<{ pools: number; internalCustomerIds: string[] }> => {
	if (internalCustomerIds.length === 0)
		return { pools: 0, internalCustomerIds: [] };

	const updated = await db.execute<{ internal_customer_id: string }>(sql`
		WITH ${pageCustomerIdsCte({ internalCustomerIds })}
		UPDATE customer_licenses AS pool
		SET
			plan_license_id = ${planLicenseId},
			granted = target.included + pool.paid_quantity,
			remaining =
				pool.remaining + ((target.included + pool.paid_quantity) - pool.granted),
			updated_at = ${Date.now()}
		FROM page, customer_products AS cp, plan_license AS target
		WHERE cp.id = pool.parent_customer_product_id
			AND target.id = ${planLicenseId}
			AND ${poolLicensePlanSql({ licensePlanId })}
			AND pool.plan_license_id IS DISTINCT FROM ${planLicenseId}
			-- Scoped on the pool as well as the parent: matching the license plan
			-- alone spans every pool in the org, so the page must drive this scan.
			AND pool.internal_customer_id = page.internal_customer_id
			AND cp.internal_customer_id = page.internal_customer_id
			AND ${operationScopeSql({ scope })}
			AND pool.id = (
				SELECT live.id
				FROM customer_licenses AS live
				JOIN customer_products AS live_parent
					ON live_parent.id = live.parent_customer_product_id
				WHERE live.link_id = pool.link_id
					AND ${poolLicensePlanSql({ licensePlanId, poolAlias: sql`live` })}
				${canonicalPoolOrderingSql({
					parentAlias: sql`live_parent`,
					poolAlias: sql`live`,
				})}
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
