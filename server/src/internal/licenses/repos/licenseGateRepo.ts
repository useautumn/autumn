import {
	type AppEnv,
	CusProductStatus,
	customerLicenses,
	customerProducts,
	licensePoolGrants,
	planLicenses,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { licensePoolParentStatuses } from "../licenseUtils.js";

const activeAssignmentStatuses = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	CusProductStatus.Trialing,
];

const sqlStatusList = (statuses: CusProductStatus[]) =>
	sql.join(
		statuses.map((status) => sql`${status}`),
		sql`, `,
	);

/** Single-roundtrip union gate: does this customer touch licenses at all? */
const touchesLicenses = async ({
	db,
	orgId,
	env,
	internalCustomerId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalCustomerId: string;
}): Promise<boolean> => {
	const [row] = await db.execute<{ touches: boolean }>(sql`
		SELECT
			EXISTS (
				SELECT 1
				FROM ${planLicenses}
				INNER JOIN ${customerProducts}
					ON ${customerProducts.internal_product_id} = ${planLicenses.parent_internal_product_id}
				WHERE ${customerProducts.internal_customer_id} = ${internalCustomerId}
					AND ${customerProducts.internal_entity_id} IS NULL
					AND ${customerProducts.status} IN (${sqlStatusList(licensePoolParentStatuses)})
			)
			OR EXISTS (
				SELECT 1
				FROM ${planLicenses}
				INNER JOIN ${customerProducts}
					ON ${customerProducts.id} = ${planLicenses.parent_customer_product_id}
				WHERE ${customerProducts.internal_customer_id} = ${internalCustomerId}
			)
			OR EXISTS (
				SELECT 1
				FROM ${customerProducts}
				WHERE ${customerProducts.internal_customer_id} = ${internalCustomerId}
					AND ${customerProducts.license_parent_customer_product_id} IS NOT NULL
					AND ${customerProducts.internal_entity_id} IS NOT NULL
					AND ${customerProducts.status} IN (${sqlStatusList(activeAssignmentStatuses)})
			)
			OR EXISTS (
				SELECT 1
				FROM ${customerLicenses}
				WHERE ${customerLicenses.org_id} = ${orgId}
					AND ${customerLicenses.env} = ${env}
					AND ${customerLicenses.internal_customer_id} = ${internalCustomerId}
			)
			OR EXISTS (
				SELECT 1
				FROM ${licensePoolGrants}
				WHERE ${licensePoolGrants.internal_customer_id} = ${internalCustomerId}
			)
			AS touches
	`);
	return row?.touches === true;
};

export const licenseGateRepo = {
	touchesLicenses,
} as const;
