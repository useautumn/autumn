import type {
	DbCustomerLicense,
	DbPlanLicense,
	FullCustomerLicense,
	FullProductWithoutLicenses,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { planLicenseFullProductJson } from "./planLicenseFullProductSql.js";

type FullCustomerLicenseRow = {
	pool: DbCustomerLicense;
	license: DbPlanLicense | null;
	product: FullProductWithoutLicenses;
};

/** Customer licenses with their effective plan license and product; `where` may use cl, c and cp. */
export const selectFullCustomerLicenses = async ({
	db,
	where,
}: {
	db: DrizzleCli;
	where: SQL;
}): Promise<FullCustomerLicense[]> => {
	const rows = (await db.execute(sql`
		SELECT
			to_jsonb(cl.*) AS pool,
			to_jsonb(pl.*) AS license,
			${planLicenseFullProductJson({
				planLicenseAlias: "pl",
				productAlias: "license_product",
			})} AS product
		FROM customer_licenses cl
		JOIN customers c ON c.internal_id = cl.internal_customer_id
		JOIN customer_products cp ON cp.id = cl.parent_customer_product_id
		JOIN products license_product
			ON license_product.internal_id = cl.license_internal_product_id
		LEFT JOIN plan_license pl
			ON pl.id = cl.plan_license_id
		WHERE ${where}
	`)) as unknown as FullCustomerLicenseRow[];

	return rows.map((row) => ({
		...row.pool,
		planLicense: row.license ? { ...row.license, product: row.product } : null,
	}));
};
