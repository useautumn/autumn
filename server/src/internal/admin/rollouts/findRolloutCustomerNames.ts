import { AppEnv, customers } from "@autumn/shared";
import { and, eq, inArray, or } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type RolloutCustomerName = {
	name: string | null;
	email: string | null;
};

/** Names for the pinned customers, by org id then customer id; a live customer wins over a sandbox one. */
export const findRolloutCustomerNames = async ({
	db,
	customersByOrgId,
}: {
	db: DrizzleCli;
	/** Only the keys are read: org id, then customer id. */
	customersByOrgId: Record<string, Record<string, unknown>>;
}): Promise<Record<string, Record<string, RolloutCustomerName>>> => {
	const orgFilters = Object.entries(customersByOrgId).map(
		([orgId, orgCustomers]) =>
			and(
				eq(customers.org_id, orgId),
				inArray(customers.id, Object.keys(orgCustomers)),
			),
	);
	if (orgFilters.length === 0) return {};

	const rows = await db
		.select({
			orgId: customers.org_id,
			customerId: customers.id,
			env: customers.env,
			name: customers.name,
			email: customers.email,
		})
		.from(customers)
		.where(or(...orgFilters));

	const namesByOrgId: Record<string, Record<string, RolloutCustomerName>> = {};
	for (const { orgId, customerId, env, name, email } of rows) {
		if (!customerId) continue;
		const orgNames = namesByOrgId[orgId] ?? {};
		if (!orgNames[customerId] || env === AppEnv.Live)
			orgNames[customerId] = { name, email };
		namesByOrgId[orgId] = orgNames;
	}
	return namesByOrgId;
};
