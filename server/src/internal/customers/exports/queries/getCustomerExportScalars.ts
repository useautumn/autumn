import {
	type AppEnv,
	type CustomerExportSnapshot,
	customers,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { buildSearchPredicates } from "../../CusSearchService.js";
import { buildMatchedCustomersSelect } from "./customerExportMatchSql.js";

export const CUSTOMER_EXPORT_PAGE_SIZE = 2000;

export type CustomerExportScalarRow = {
	internal_id: string;
	id: string | null;
	name: string | null;
	email: string | null;
};

/**
 * Keyset page of scalar columns in descending internal_id order. Ids are
 * time-ordered, so customers created after the walk starts are never revisited.
 */
export const getCustomerExportScalars = async ({
	db,
	orgId,
	env,
	snapshot,
	afterInternalId,
	limit = CUSTOMER_EXPORT_PAGE_SIZE,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	snapshot: CustomerExportSnapshot;
	/** Last id emitted by the previous page; the next page starts strictly below it. */
	afterInternalId: string | null;
	limit?: number;
}): Promise<CustomerExportScalarRow[]> => {
	const predicates = buildSearchPredicates({
		orgId,
		env,
		search: snapshot.search,
		filters: snapshot.filters,
	});

	const matched = buildMatchedCustomersSelect({
		predicates,
		columns: sql`${customers.internal_id} AS internal_id, ${customers.id} AS id, ${customers.name} AS name, ${customers.email} AS email`,
		extraWhere: afterInternalId
			? sql`${customers.internal_id} < ${afterInternalId}`
			: undefined,
	});

	return (await db.execute(sql`
		${matched}
		ORDER BY internal_id DESC
		LIMIT ${limit}
		${planetScaleTag({ query: "getCustomerExportScalars" })}
	`)) as unknown as CustomerExportScalarRow[];
};
