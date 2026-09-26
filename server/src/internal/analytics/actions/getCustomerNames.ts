import { type CustomerDisplayInfo, customers } from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

/** Looks up customer display fields by public id. Customer ids with no row are omitted. */
export const getCustomerNames = async ({
	db,
	customerIds,
	orgId,
	env,
}: {
	db: DrizzleCli;
	customerIds: string[];
	orgId: string;
	env: string;
}): Promise<Record<string, CustomerDisplayInfo>> => {
	if (customerIds.length === 0) return {};

	const rows = await db
		.select({ id: customers.id, name: customers.name, email: customers.email })
		.from(customers)
		.where(
			and(
				eq(customers.org_id, orgId),
				eq(customers.env, env),
				inArray(customers.id, customerIds),
			),
		);

	const displayMap: Record<string, CustomerDisplayInfo> = {};
	for (const row of rows) {
		if (!row.id) continue;
		displayMap[row.id] = { name: row.name || null, email: row.email || null };
	}

	return displayMap;
};
