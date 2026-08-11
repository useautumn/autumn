import { MIGRATABLE_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import {
	type OperationScope,
	operationScopeSql,
} from "../../scope/operationScope.js";

/**
 * Carries assignments from the entitlement they hold onto the minted one,
 * crediting the allowance delta so consumption survives. The delta is read from
 * the two definitions rather than passed in, so a partly used balance moves by
 * the same amount the allowance did.
 */
export const carryLicenseEntitlementRows = async ({
	db,
	internalCustomerIds,
	scope,
	fromEntitlementId,
	toEntitlementId,
	licenseInternalProductId,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	fromEntitlementId: string;
	toEntitlementId: string;
	licenseInternalProductId: string;
}): Promise<string[]> => {
	if (internalCustomerIds.length === 0) return [];

	const carried = await db.execute<{ id: string }>(sql`
		WITH allowances AS (
			SELECT
				(SELECT allowance FROM entitlements WHERE id = ${toEntitlementId}) AS next,
				(SELECT allowance FROM entitlements WHERE id = ${fromEntitlementId}) AS previous
		)
		UPDATE customer_entitlements AS target
		SET
			entitlement_id = ${toEntitlementId},
			balance = target.balance
				+ COALESCE(allowances.next, 0)
				- COALESCE(allowances.previous, 0)
		FROM allowances,
			customer_products AS assignment,
			customer_licenses AS pool,
			customer_products AS cp
		WHERE assignment.id = target.customer_product_id
			AND pool.link_id = assignment.customer_license_link_id
			AND pool.license_internal_product_id = ${licenseInternalProductId}
			AND cp.id = pool.parent_customer_product_id
			AND target.entitlement_id = ${fromEntitlementId}
			AND target.balance IS NOT NULL
			AND assignment.internal_customer_id = ANY(${sql.param(internalCustomerIds)}::text[])
			AND assignment.internal_entity_id IS NOT NULL
			AND assignment.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})
			AND ${operationScopeSql({ scope })}
		RETURNING target.id
	`);

	return carried.map((row) => row.id);
};
