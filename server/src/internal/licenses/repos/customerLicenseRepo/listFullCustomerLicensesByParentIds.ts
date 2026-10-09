import type {
	AppEnv,
	DbCustomerLicense,
	DbPlanLicense,
	FullCustomerLicense,
	FullProductWithoutLicenses,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { planLicenseFullProductJson } from "../utils/planLicenseFullProductSql.js";

type FullCustomerLicenseRow = {
	pool: DbCustomerLicense;
	license: DbPlanLicense | null;
	product: FullProductWithoutLicenses;
};

export const listFullCustomerLicensesByParentIds = async ({
	db,
	orgId,
	env,
	parentCustomerProductIds,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	parentCustomerProductIds: string[];
}): Promise<FullCustomerLicense[]> => {
	if (parentCustomerProductIds.length === 0) return [];

	const query = sql`
		SELECT
			to_jsonb(cl.*) AS pool,
			to_jsonb(pl.*) AS license,
			${planLicenseFullProductJson({
				planLicenseAlias: "pl",
				productAlias: "license_product",
			})} AS product
		FROM customer_licenses cl
		JOIN customers c ON c.internal_id = cl.internal_customer_id
		JOIN products license_product
			ON license_product.internal_id = cl.license_internal_product_id
		LEFT JOIN plan_license pl
			ON pl.id = cl.plan_license_id
		WHERE cl.parent_customer_product_id = ANY(${sql.param(parentCustomerProductIds)}::text[])
			AND c.org_id = ${orgId}
			AND c.env = ${env}
	`;

	const rows = (await db.execute(query)) as unknown as FullCustomerLicenseRow[];
	return rows.map((row) => ({
		...row.pool,
		planLicense: row.license
			? {
					...row.license,
					product: row.product,
				}
			: null,
	}));
};
