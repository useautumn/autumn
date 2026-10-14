import {
	type AppEnv,
	type FullCustomerLicense,
	RELEVANT_STATUSES,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { selectFullCustomerLicenses } from "../utils/selectFullCustomerLicenses.js";

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
	return selectFullCustomerLicenses({
		db,
		where: sql`c.id = ${customerId}
			AND c.org_id = ${orgId}
			AND c.env = ${env}
			AND cp.status IN (${sql.join(
				RELEVANT_STATUSES.map((status) => sql`${status}`),
				sql`, `,
			)})`,
	});
};
