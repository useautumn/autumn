import {
	type AppEnv,
	type DbCustomerLicense,
	type DbPlanLicense,
	type FullCustomerLicense,
	type FullProductWithoutLicenses,
	RELEVANT_STATUSES,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { planLicenseFullProductJson } from "../utils/planLicenseFullProductSql.js";

type FullCustomerLicenseRow = {
	pool: DbCustomerLicense;
	license: DbPlanLicense | null;
	parent_plan_id: string;
	license_plan_id: string;
	product: FullProductWithoutLicenses;
};

/**
 * A customer's live customer licenses (parent in a relevant status — expired
 * parents' rows are reconcile's business, fetched there with bounded reads),
 * each with its effective plan license (customer override beats catalog) and
 * that license's effective FullProduct — one round trip. A removed link
 * hydrates as license: null; reconcile owns the cleanup.
 */
export const getFullCustomerLicenses = async ({
	db,
	orgId,
	env,
	customerId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	customerId: string;
}): Promise<FullCustomerLicense[]> => {
	const query = sql`
		SELECT
			to_jsonb(cl.*) AS pool,
			to_jsonb(pl.*) AS license,
			parent_product.id AS parent_plan_id,
			license_product.id AS license_plan_id,
			${planLicenseFullProductJson({
				planLicenseAlias: "pl",
				productAlias: "license_product",
			})} AS product
		FROM customer_licenses cl
		JOIN customers c ON c.internal_id = cl.internal_customer_id
		JOIN customer_products cp ON cp.id = cl.parent_customer_product_id
		JOIN products parent_product
			ON parent_product.internal_id = cp.internal_product_id
		JOIN products license_product
			ON license_product.internal_id = cl.license_internal_product_id
		LEFT JOIN LATERAL (
			SELECT *
			FROM plan_license
			WHERE plan_license.license_internal_product_id = cl.license_internal_product_id
				AND (
					plan_license.parent_customer_product_id = cl.parent_customer_product_id
					OR (
						plan_license.parent_customer_product_id IS NULL
						AND plan_license.parent_internal_product_id = cp.internal_product_id
					)
				)
			ORDER BY plan_license.parent_customer_product_id NULLS LAST
			LIMIT 1
		) pl ON true
		WHERE c.id = ${customerId}
			AND c.org_id = ${orgId}
			AND c.env = ${env}
			AND cp.status IN (${sql.join(
				RELEVANT_STATUSES.map((status) => sql`${status}`),
				sql`, `,
			)})
	`;

	const rows = (await db.execute(query)) as unknown as FullCustomerLicenseRow[];
	return rows.map((row) => ({
		...row.pool,
		license: row.license
			? {
					id: row.license.id,
					parent_plan_id: row.parent_plan_id,
					license_plan_id: row.license_plan_id,
					included: row.license.included,
					prepaid_only: row.license.prepaid_only,
					metadata: row.license.metadata,
					created_at: row.license.created_at,
					updated_at: row.license.updated_at,
					product: row.product,
				}
			: null,
	}));
};
