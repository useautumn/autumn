import type { AppEnv, FullCustomerLicense } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { selectFullCustomerLicenses } from "../utils/selectFullCustomerLicenses.js";

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

	return selectFullCustomerLicenses({
		db,
		where: sql`cl.parent_customer_product_id = ANY(${sql.param(parentCustomerProductIds)}::text[])
			AND c.org_id = ${orgId}
			AND c.env = ${env}`,
	});
};
