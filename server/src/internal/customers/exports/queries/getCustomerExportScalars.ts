import {
	type AppEnv,
	type CustomerExportSnapshot,
	customers,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { buildSearchPredicates } from "../../CusSearchService.js";
import {
	buildInternalIdRangeClause,
	buildMatchedCustomersSelect,
} from "./customerExportMatchSql.js";

export const CUSTOMER_EXPORT_PAGE_SIZE = 2000;

export type CustomerExportScalarRow = {
	internal_id: string;
	id: string | null;
	name: string | null;
	email: string | null;
};

/** Keyset page of scalar columns inside one worker's descending id range. */
export const getCustomerExportScalars = async ({
	db,
	orgId,
	env,
	snapshot,
	upperInternalId,
	lowerInternalId,
	afterInternalId,
	limit = CUSTOMER_EXPORT_PAGE_SIZE,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	snapshot: CustomerExportSnapshot;
	upperInternalId: string | null;
	lowerInternalId: string | null;
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

	const rangeClause = buildInternalIdRangeClause({
		upperInternalId,
		lowerInternalId,
	});
	const cursorClause = afterInternalId
		? sql`${customers.internal_id} < ${afterInternalId}`
		: undefined;

	const extraClauses = [rangeClause, cursorClause].filter(
		(clause): clause is SQL => clause !== undefined,
	);

	const matched = buildMatchedCustomersSelect({
		predicates,
		columns: sql`${customers.internal_id} AS internal_id, ${customers.id} AS id, ${customers.name} AS name, ${customers.email} AS email`,
		extraWhere:
			extraClauses.length > 0 ? sql.join(extraClauses, sql` AND `) : undefined,
	});

	return (await db.execute(sql`
		${matched}
		ORDER BY internal_id DESC
		LIMIT ${limit}
		${planetScaleTag({ query: "getCustomerExportScalars" })}
	`)) as unknown as CustomerExportScalarRow[];
};
