import {
	type AppEnv,
	type FullCustomerLicense,
	RELEVANT_STATUSES,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { selectFullCustomerLicenses } from "../utils/selectFullCustomerLicenses.js";

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
